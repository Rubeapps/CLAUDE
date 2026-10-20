import "server-only";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import type { SupplierRate } from "@/lib/finance/landed-cost";
import {
  computeDashboard,
  type BusinessSettings,
  type CostProductWithMapping,
  type DashboardResult,
} from "@/lib/finance/metrics";
import { getFxRates, type FxRates } from "@/lib/integrations/fx";
import { fetchDailyAdSpend, MetaNotConfigured } from "@/lib/integrations/meta-ads";
import { fetchLowStock, fetchOrders, ShopifyNotConfigured, toLocalDate, type LowStockVariant } from "@/lib/integrations/shopify";
import { createClient } from "@/lib/supabase/server";

export const RANGE_OPTIONS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];

export interface SourceStatus {
  source: "Shopify" | "Meta Ads" | "Tabela de custos";
  kind: "not_configured" | "error";
  message: string;
}

export interface DashboardData {
  from: string;
  to: string;
  result: DashboardResult;
  lowStock: LowStockVariant[] | null;
  lowStockThreshold: number;
  settings: BusinessSettings;
  fx: FxRates;
  sources: SourceStatus[];
  hasCostTable: boolean;
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  vatMode: "exempt",
  vatRate: 23,
  shippingMode: "together",
  primaryProductKey: "principal",
};

/** Tabela de custos + definições do utilizador (RLS ativo). */
export async function loadCostConfig() {
  await requireUser();
  const supabase = await createClient();

  const [products, rates, settings] = await Promise.all([
    supabase.from("cost_products").select("id, key, name, currency, shopify_product_ids, bundled_extra_shipping").order("key"),
    supabase
      .from("supplier_rates")
      .select("product_id, country_code, quantity, product_cost, shipping_cost, valid_from"),
    supabase.from("business_settings").select("*").maybeSingle(),
  ]);

  const error = products.error ?? rates.error ?? settings.error;
  if (error) throw new Error(`Supabase: ${error.message}`);

  const productRows = products.data ?? [];
  const byId = new Map(productRows.map((p) => [p.id as string, p]));

  const costProducts: (CostProductWithMapping & { id: string; name: string })[] = productRows.map((p) => ({
    id: p.id,
    name: p.name,
    key: p.key,
    currency: p.currency,
    bundledExtraShipping: p.bundled_extra_shipping === null ? null : Number(p.bundled_extra_shipping),
    shopifyProductIds: p.shopify_product_ids ?? [],
  }));

  const supplierRates: SupplierRate[] = (rates.data ?? []).flatMap((r) => {
    const product = byId.get(r.product_id);
    if (!product) return [];
    return [
      {
        productKey: product.key,
        currency: product.currency,
        country: r.country_code,
        quantity: r.quantity,
        productCost: Number(r.product_cost),
        shippingCost: Number(r.shipping_cost),
        validFrom: r.valid_from,
      },
    ];
  });

  const s = settings.data;
  const businessSettings: BusinessSettings = s
    ? {
        vatMode: s.vat_mode,
        vatRate: Number(s.vat_rate),
        shippingMode: s.default_shipping_mode,
        primaryProductKey: s.primary_product_key,
      }
    : DEFAULT_SETTINGS;

  return { costProducts, supplierRates, settings: businessSettings };
}

export async function loadDashboard(days: RangeDays): Promise<DashboardData> {
  const e = env();
  const to = toLocalDate(new Date().toISOString(), e.APP_TIMEZONE);
  const fromDate = new Date(`${to}T00:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  const from = fromDate.toISOString().slice(0, 10);

  const [config, orders, ads, lowStock, fx] = await Promise.allSettled([
    loadCostConfig(),
    fetchOrders(from, to),
    fetchDailyAdSpend(from, to),
    fetchLowStock(e.LOW_STOCK_THRESHOLD),
    getFxRates(),
  ]);

  const sources: SourceStatus[] = [];
  const failed = (source: SourceStatus["source"], r: PromiseSettledResult<unknown>) => {
    if (r.status === "fulfilled") return;
    const err = r.reason;
    const notConfigured = err instanceof ShopifyNotConfigured || err instanceof MetaNotConfigured;
    const message = err instanceof Error ? err.message : String(err);
    if (!sources.some((s) => s.source === source && s.message === message)) {
      sources.push({ source, kind: notConfigured ? "not_configured" : "error", message });
    }
  };
  failed("Tabela de custos", config);
  failed("Shopify", orders);
  failed("Meta Ads", ads);
  failed("Shopify", lowStock);

  const cfg =
    config.status === "fulfilled"
      ? config.value
      : { costProducts: [], supplierRates: [], settings: DEFAULT_SETTINGS };
  const fxRates = fx.status === "fulfilled" ? fx.value : { toEur: { EUR: 1, USD: e.FX_USD_EUR_FALLBACK }, fallback: true, date: null };

  const result = computeDashboard({
    from,
    to,
    orders: orders.status === "fulfilled" ? orders.value : [],
    adSpend: ads.status === "fulfilled" ? ads.value : [],
    rates: cfg.supplierRates,
    products: cfg.costProducts,
    settings: cfg.settings,
    toEur: fxRates.toEur,
  });

  return {
    from,
    to,
    result,
    lowStock: lowStock.status === "fulfilled" ? lowStock.value : null,
    lowStockThreshold: e.LOW_STOCK_THRESHOLD,
    settings: cfg.settings,
    fx: fxRates,
    sources,
    hasCostTable: cfg.supplierRates.length > 0,
  };
}
