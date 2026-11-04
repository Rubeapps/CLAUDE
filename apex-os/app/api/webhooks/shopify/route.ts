import { NextResponse, type NextRequest } from "next/server";
import { computeOrderEconomics, type ProductCost } from "@/lib/calculations/unit-economics";
import { requireServerEnv } from "@/lib/env";
import { errorMessage, jsonError } from "@/lib/http";
import { normalizeShopDomain, resolveOrderGateway, shopifyOrderWebhookSchema, SUPPORTED_ORDER_TOPICS, verifyShopifyHmac } from "@/lib/shopify";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WebhookSuccessBody {
  ok: true;
  topic: string;
  order_id: string;
  net_profit: number;
  unmatched_skus: string[];
}

/**
 * POST /api/webhooks/shopify
 * Tópicos: orders/create, orders/updated, orders/paid, orders/cancelled.
 * 1. Valida X-Shopify-Hmac-Sha256 sobre o corpo bruto.
 * 2. Resolve o user_id pelo X-Shopify-Shop-Domain (tabela dropship_stores).
 * 3. Calcula COGS, portes, taxa da gateway e lucro → upsert em dropship_orders.
 */
export async function POST(request: NextRequest) {
  try {
    let secret: string;
    try {
      secret = requireServerEnv("SHOPIFY_WEBHOOK_SECRET");
    } catch (error) {
      return jsonError(500, "configuration_error", errorMessage(error));
    }

    const rawBody = await request.text();
    if (!verifyShopifyHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"), secret)) {
      return jsonError(401, "invalid_signature", "Assinatura HMAC X-Shopify-Hmac-Sha256 inválida.");
    }

    const topic = request.headers.get("x-shopify-topic") ?? "";
    if (!SUPPORTED_ORDER_TOPICS.has(topic)) {
      // 200 para o Shopify não repetir tópicos que não nos interessam.
      return NextResponse.json({ ok: true, ignored: true, topic }, { status: 200 });
    }

    const shopDomain = normalizeShopDomain(request.headers.get("x-shopify-shop-domain") ?? "");
    if (!shopDomain) {
      return jsonError(400, "missing_shop_domain", "Cabeçalho X-Shopify-Shop-Domain ausente ou inválido.");
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return jsonError(400, "invalid_json", "O corpo do webhook não é JSON válido.");
    }

    const parsed = shopifyOrderWebhookSchema.safeParse(json);
    if (!parsed.success) {
      return jsonError(400, "invalid_payload", "Payload de encomenda inválido.", parsed.error.issues);
    }
    const order = parsed.data;

    const supabase = createServiceClient();

    const { data: store, error: storeError } = await supabase
      .from("dropship_stores")
      .select("user_id")
      .eq("shop_domain", shopDomain)
      .maybeSingle();
    if (storeError) return jsonError(500, "database_error", storeError.message);
    if (!store) {
      return jsonError(404, "store_not_registered", `A loja ${shopDomain} não está ligada a nenhum utilizador do Apex OS.`);
    }
    const userId = store.user_id;

    const skus = [...new Set(order.line_items.map((li) => li.sku?.trim()).filter((sku): sku is string => Boolean(sku)))];
    const costsBySku = new Map<string, ProductCost>();
    if (skus.length > 0) {
      const { data: products, error: productsError } = await supabase
        .from("dropship_products")
        .select("sku, cogs, shipping_cost")
        .eq("user_id", userId)
        .in("sku", skus);
      if (productsError) return jsonError(500, "database_error", productsError.message);
      for (const product of products) {
        costsBySku.set(product.sku, { cogs: Number(product.cogs), shipping_cost: Number(product.shipping_cost) });
      }
    }

    const gateway = resolveOrderGateway(order);
    const financialStatus = topic === "orders/cancelled" ? "voided" : (order.financial_status ?? "pending");
    const economics = computeOrderEconomics({
      salePrice: order.total_price,
      gateway,
      lineItems: order.line_items.map((li) => ({ sku: li.sku ?? null, quantity: li.quantity })),
      costsBySku,
    });

    const { error: upsertError } = await supabase.from("dropship_orders").upsert(
      {
        user_id: userId,
        shopify_order_id: order.id,
        order_number: order.name ?? `#${order.order_number}`,
        total_price: order.total_price,
        currency: order.currency.toUpperCase(),
        gateway,
        gateway_fee: economics.gatewayFee,
        total_cogs: economics.totalCogs,
        total_shipping: economics.totalShipping,
        net_profit: economics.netProfit,
        status_financial: financialStatus,
        created_at: order.created_at,
      },
      { onConflict: "user_id,shopify_order_id" },
    );
    if (upsertError) return jsonError(500, "database_error", upsertError.message);

    const body: WebhookSuccessBody = {
      ok: true,
      topic,
      order_id: order.id,
      net_profit: economics.netProfit,
      unmatched_skus: economics.unmatchedSkus,
    };
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    return jsonError(500, "internal_error", errorMessage(error));
  }
}

export function GET() {
  return jsonError(405, "method_not_allowed", "Usa POST (webhook Shopify).");
}
