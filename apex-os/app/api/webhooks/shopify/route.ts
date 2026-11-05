import { NextResponse, type NextRequest } from "next/server";
import { calculateUnitEconomics } from "@/lib/calculations/engine";
import { computeOrderEconomics, resolveGatewayFeeRule, type ProductCost } from "@/lib/calculations/unit-economics";
import { requireServerEnv } from "@/lib/env";
import { errorMessage, jsonError } from "@/lib/http";
import { normalizeShopDomain, resolveOrderGateway, shopifyOrderWebhookSchema, SUPPORTED_ORDER_TOPICS, verifyShopifyHmac } from "@/lib/shopify";
import { createServiceClient } from "@/lib/supabase/server";
import { isTelegramConfigured, sendTelegramAlert } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WebhookSuccessBody {
  ok: true;
  topic: string;
  order_id: string;
  net_profit: number;
  margin_pct: number | null;
  unmatched_skus: string[];
  alerted: boolean;
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

    const country = order.shipping_address?.country_code?.trim().toUpperCase() ?? null;
    const shippingCountry = country && /^[A-Z]{2}$/.test(country) ? country : null;
    const skus = [...new Set(order.line_items.map((li) => li.sku?.trim()).filter((sku): sku is string => Boolean(sku)))];
    const costsBySku = new Map<string, ProductCost>();
    if (skus.length > 0) {
      const { data: products, error: productsError } = await supabase
        .from("dropship_products")
        .select("sku, name, cogs, shipping_cost, shipping_cost_2, shipping_cost_3")
        .eq("user_id", userId)
        .in("sku", skus);
      if (productsError) return jsonError(500, "database_error", productsError.message);

      // Portes do país de entrega (se configurados) substituem os portes por defeito do produto.
      const countryRates = new Map<string, { s1: number; s2: number | null; s3: number | null }>();
      if (shippingCountry) {
        const names = [...new Set(products.map((p) => p.name))];
        const { data: rates, error: ratesError } = await supabase
          .from("dropship_shipping_rates")
          .select("product_name, shipping_1, shipping_2, shipping_3")
          .eq("user_id", userId)
          .eq("country_code", shippingCountry)
          .in("product_name", names);
        if (ratesError) return jsonError(500, "database_error", ratesError.message);
        for (const r of rates) {
          countryRates.set(r.product_name, { s1: Number(r.shipping_1), s2: r.shipping_2 === null ? null : Number(r.shipping_2), s3: r.shipping_3 === null ? null : Number(r.shipping_3) });
        }
      }

      for (const product of products) {
        const rate = countryRates.get(product.name);
        if (rate) {
          costsBySku.set(product.sku, { cogs: Number(product.cogs), shipping_cost: rate.s1, shipping_cost_2: rate.s2, shipping_cost_3: rate.s3, product: product.name });
          continue;
        }
        costsBySku.set(product.sku, {
          cogs: Number(product.cogs),
          shipping_cost: Number(product.shipping_cost),
          shipping_cost_2: product.shipping_cost_2 === null ? null : Number(product.shipping_cost_2),
          shipping_cost_3: product.shipping_cost_3 === null ? null : Number(product.shipping_cost_3),
          product: product.name,
        });
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

    const rule = resolveGatewayFeeRule(gateway);
    const unit = calculateUnitEconomics(order.total_price, economics.totalCogs, economics.totalShipping, rule.fixed, rule.percent);

    const { data: existing, error: existingError } = await supabase
      .from("dropship_orders")
      .select("id")
      .eq("user_id", userId)
      .eq("shopify_order_id", order.id)
      .maybeSingle();
    if (existingError) return jsonError(500, "database_error", existingError.message);

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
        shipping_country: shippingCountry,
        created_at: order.created_at,
      },
      { onConflict: "user_id,shopify_order_id" },
    );
    if (upsertError) return jsonError(500, "database_error", upsertError.message);

    // Alerta [DROPSHIP] só na primeira receção da encomenda (o Shopify repete webhooks).
    let alerted = false;
    if (topic === "orders/create" && !existing && isTelegramConfigured()) {
      const currency = order.currency.toUpperCase();
      const lines = [
        `Nova encomenda ${order.name ?? `#${order.order_number}`} · ${shopDomain}`,
        `Total: ${order.total_price.toFixed(2)} ${currency} · ${gateway}`,
        `COGS ${economics.totalCogs.toFixed(2)} · Portes ${economics.totalShipping.toFixed(2)} · Taxa ${economics.gatewayFee.toFixed(2)}`,
        `Lucro: ${economics.netProfit.toFixed(2)} ${currency} (${unit.marginPct === null ? "—" : `${unit.marginPct.toFixed(1)}%`})`,
      ];
      if (economics.netProfit <= 0) lines.push("⚠️ Encomenda sem margem positiva.");
      if (economics.unmatchedSkus.length > 0) lines.push(`⚠️ SKUs sem custo registado: ${economics.unmatchedSkus.join(", ")}`);
      alerted = await sendTelegramAlert(lines.join("\n"), "DROPSHIP");
    }

    const body: WebhookSuccessBody = {
      ok: true,
      topic,
      order_id: order.id,
      net_profit: economics.netProfit,
      margin_pct: unit.marginPct,
      unmatched_skus: economics.unmatchedSkus,
      alerted,
    };
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    return jsonError(500, "internal_error", errorMessage(error));
  }
}

export function GET() {
  return jsonError(405, "method_not_allowed", "Usa POST (webhook Shopify).");
}
