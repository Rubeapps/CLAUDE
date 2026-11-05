import "server-only";

import { aggregateDailyPnl, summarizePnl, toDateKey, type DailyPnl, type PnlSummary } from "@/lib/calculations/unit-economics";
import type { DropshipAdCreativeRow, DropshipAdSpendRow, DropshipOrderRow, DropshipProductRow, DropshipStoreRow } from "@/lib/database.types";
import { getAppTimeZone } from "@/lib/format";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

export const RANGE_OPTIONS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];

export function parseRange(value: string | undefined): RangeDays {
  const n = Number(value);
  return RANGE_OPTIONS.find((option) => option === n) ?? 30;
}

export interface DropshipData {
  from: string;
  to: string;
  currency: string;
  daily: DailyPnl[];
  summary: PnlSummary;
  today: DailyPnl | null;
  products: DropshipProductRow[];
  recentOrders: DropshipOrderRow[];
  adSpend: DropshipAdSpendRow[];
  stores: DropshipStoreRow[];
  /** Break-even CPA sugerido = lucro médio por encomenda antes de ads no período. */
  breakEvenCpa: number | null;
}

/** Criativos da importação mais recente (todas as linhas da data mais recente guardada). */
export async function getLatestAdCreatives(supabase: TypedSupabaseClient, userId: string): Promise<DropshipAdCreativeRow[]> {
  const { data: latest, error } = await supabase.from("dropship_ad_creatives").select("date").eq("user_id", userId).order("date", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  const date = latest[0]?.date;
  if (!date) return [];
  const { data, error: rowsError } = await supabase.from("dropship_ad_creatives").select("*").eq("user_id", userId).eq("date", date).order("spend", { ascending: false }).limit(500);
  if (rowsError) throw new Error(rowsError.message);
  return data.map((r) => ({
    ...r,
    spend: Number(r.spend),
    frequency: r.frequency === null ? null : Number(r.frequency),
    ctr: r.ctr === null ? null : Number(r.ctr),
    cpa: r.cpa === null ? null : Number(r.cpa),
  }));
}

function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Carrega e agrega todos os dados de dropshipping do utilizador (queries filtradas por user_id + RLS). */
export async function getDropshipData(supabase: TypedSupabaseClient, userId: string, rangeDays: RangeDays): Promise<DropshipData> {
  const timeZone = getAppTimeZone();
  const to = toDateKey(new Date(), timeZone);
  const from = shiftDateKey(to, -(rangeDays - 1));
  // Margem de 1 dia em cada lado para cobrir a diferença entre UTC e o fuso local.
  const fromIso = new Date(`${shiftDateKey(from, -1)}T00:00:00Z`).toISOString();

  const [ordersRes, adRes, productsRes, storesRes] = await Promise.all([
    supabase.from("dropship_orders").select("*").eq("user_id", userId).gte("created_at", fromIso).order("created_at", { ascending: false }).limit(5000),
    supabase.from("dropship_ad_spend").select("*").eq("user_id", userId).gte("date", from).lte("date", to).order("date", { ascending: false }),
    supabase.from("dropship_products").select("*").eq("user_id", userId).order("name", { ascending: true }),
    supabase.from("dropship_stores").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
  ]);

  for (const res of [ordersRes, adRes, productsRes, storesRes]) {
    if (res.error) throw new Error(`Erro ao carregar dados de dropshipping: ${res.error.message}`);
  }

  const orders = (ordersRes.data ?? []).map((o) => ({
    ...o,
    total_price: Number(o.total_price),
    gateway_fee: Number(o.gateway_fee),
    total_cogs: Number(o.total_cogs),
    total_shipping: Number(o.total_shipping),
    net_profit: Number(o.net_profit),
  }));
  const adSpend = (adRes.data ?? []).map((a) => ({ ...a, amount: Number(a.amount) }));

  const daily = aggregateDailyPnl({ orders, adSpend, from, to, timeZone });
  const summary = summarizePnl(daily);
  const currencyCounts = new Map<string, number>();
  for (const o of orders) currencyCounts.set(o.currency, (currencyCounts.get(o.currency) ?? 0) + 1);
  const currency = [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "EUR";

  return {
    from,
    to,
    currency,
    daily,
    summary,
    breakEvenCpa: summary.orders > 0 && summary.orderProfit > 0 ? Math.round((summary.orderProfit / summary.orders) * 100) / 100 : null,
    today: daily[daily.length - 1] ?? null,
    products: (productsRes.data ?? []).map((p) => ({ ...p, cogs: Number(p.cogs), shipping_cost: Number(p.shipping_cost) })),
    recentOrders: orders.slice(0, 25),
    adSpend: adSpend.slice(0, 60),
    stores: storesRes.data ?? [],
  };
}
