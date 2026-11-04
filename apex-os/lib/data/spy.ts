import "server-only";

import type { SpyTargetRow, SpyTrackedProductRow } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

export interface SpyTargetWithStats extends SpyTargetRow {
  productCount: number;
  outOfStock: number;
}

export interface FeedProduct extends SpyTrackedProductRow {
  storeName: string;
  storeUrl: string;
}

export interface FeedPriceChange {
  id: string;
  oldPrice: number;
  newPrice: number;
  detectedAt: string | null;
  product: FeedProduct;
}

export interface SpyData {
  targets: SpyTargetWithStats[];
  newest: FeedProduct[];
  priceChanges: FeedPriceChange[];
  outOfStock: FeedProduct[];
  totals: { targets: number; active: number; products: number; changes24h: number };
}

function normalizeProduct(row: SpyTrackedProductRow, targets: Map<string, SpyTargetRow>): FeedProduct {
  const target = targets.get(row.target_id);
  return {
    ...row,
    shopify_product_id: Number(row.shopify_product_id),
    current_price: Number(row.current_price),
    compare_at_price: row.compare_at_price === null ? null : Number(row.compare_at_price),
    storeName: target?.store_name ?? "—",
    storeUrl: target?.store_url ?? "",
  };
}

/** Dados do Spy Engine. Os produtos são lidos apenas para target_ids do utilizador (e protegidos por RLS). */
export async function getSpyData(supabase: TypedSupabaseClient, userId: string, feedLimit = 60): Promise<SpyData> {
  const { data: targetRows, error: targetsError } = await supabase.from("spy_targets").select("*").eq("user_id", userId).order("created_at", { ascending: true });
  if (targetsError) throw new Error(targetsError.message);

  const targetMap = new Map(targetRows.map((t) => [t.id, t]));
  const targetIds = targetRows.map((t) => t.id);
  if (targetIds.length === 0) {
    return { targets: [], newest: [], priceChanges: [], outOfStock: [], totals: { targets: 0, active: 0, products: 0, changes24h: 0 } };
  }

  const countPromises = targetIds.map(async (id) => {
    const [all, oos] = await Promise.all([
      supabase.from("spy_tracked_products").select("id", { count: "exact", head: true }).eq("target_id", id),
      supabase.from("spy_tracked_products").select("id", { count: "exact", head: true }).eq("target_id", id).eq("is_available", false),
    ]);
    if (all.error) throw new Error(all.error.message);
    if (oos.error) throw new Error(oos.error.message);
    return { id, productCount: all.count ?? 0, outOfStock: oos.count ?? 0 };
  });

  const [counts, newestRes, oosRes] = await Promise.all([
    Promise.all(countPromises),
    supabase.from("spy_tracked_products").select("*").in("target_id", targetIds).order("published_at", { ascending: false, nullsFirst: false }).limit(feedLimit),
    supabase.from("spy_tracked_products").select("*").in("target_id", targetIds).eq("is_available", false).order("last_updated_at", { ascending: false }).limit(feedLimit),
  ]);
  if (newestRes.error) throw new Error(newestRes.error.message);
  if (oosRes.error) throw new Error(oosRes.error.message);

  // Histórico de preços: primeiro os IDs de produtos do utilizador mais alterados recentemente.
  const { data: historyRows, error: historyError } = await supabase
    .from("spy_price_history")
    .select("*")
    .order("detected_at", { ascending: false })
    .limit(feedLimit * 3);
  if (historyError) throw new Error(historyError.message);

  const productIds = [...new Set(historyRows.map((h) => h.tracked_product_id))];
  const productMap = new Map<string, FeedProduct>();
  if (productIds.length > 0) {
    const { data: historyProducts, error } = await supabase.from("spy_tracked_products").select("*").in("id", productIds).in("target_id", targetIds);
    if (error) throw new Error(error.message);
    for (const p of historyProducts) productMap.set(p.id, normalizeProduct(p, targetMap));
  }

  const priceChanges: FeedPriceChange[] = [];
  for (const h of historyRows) {
    const product = productMap.get(h.tracked_product_id);
    if (!product) continue;
    priceChanges.push({ id: h.id, oldPrice: Number(h.old_price), newPrice: Number(h.new_price), detectedAt: h.detected_at, product });
    if (priceChanges.length >= feedLimit) break;
  }

  const countMap = new Map(counts.map((c) => [c.id, c]));
  const targets: SpyTargetWithStats[] = targetRows.map((t) => ({
    ...t,
    productCount: countMap.get(t.id)?.productCount ?? 0,
    outOfStock: countMap.get(t.id)?.outOfStock ?? 0,
  }));

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return {
    targets,
    newest: newestRes.data.map((p) => normalizeProduct(p, targetMap)),
    priceChanges,
    outOfStock: oosRes.data.map((p) => normalizeProduct(p, targetMap)),
    totals: {
      targets: targets.length,
      active: targets.filter((t) => t.is_active).length,
      products: targets.reduce((sum, t) => sum + t.productCount, 0),
      changes24h: priceChanges.filter((c) => c.detectedAt !== null && new Date(c.detectedAt).getTime() >= dayAgo).length,
    },
  };
}
