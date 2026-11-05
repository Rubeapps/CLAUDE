import "server-only";

import type { SpyAdCreativeRow } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

export interface AdTargetOption {
  id: string;
  storeName: string;
  metaPageId: string | null;
}

export interface SpyAdsData {
  ads: SpyAdCreativeRow[];
  targets: AdTargetOption[];
  lastSyncAt: string | null;
}

/** Criativos guardados do utilizador (filtro explícito por user_id + RLS) e lojas para o seletor. */
export async function getSpyAdsData(supabase: TypedSupabaseClient, userId: string): Promise<SpyAdsData> {
  const [adsRes, targetsRes] = await Promise.all([
    supabase.from("spy_ad_creatives").select("*").eq("user_id", userId).order("winner_score", { ascending: false }).limit(1000),
    supabase.from("spy_targets").select("id, store_name, meta_page_id").eq("user_id", userId).order("store_name", { ascending: true }),
  ]);
  if (adsRes.error) throw new Error(adsRes.error.message);
  if (targetsRes.error) throw new Error(targetsRes.error.message);

  const ads = adsRes.data.map((a) => ({ ...a, winner_score: Number(a.winner_score) }));
  const lastSyncAt = ads.reduce<string | null>((max, a) => (a.updated_at && (!max || a.updated_at > max) ? a.updated_at : max), null);
  return {
    ads,
    targets: targetsRes.data.map((t) => ({ id: t.id, storeName: t.store_name, metaPageId: t.meta_page_id })),
    lastSyncAt,
  };
}
