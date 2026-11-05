import "server-only";

import { z } from "zod";
import { calculateAdWinnerScore } from "@/lib/calculations/ad-scoring";
import type { SpyAdCreativeInsert } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

/**
 * Cliente da Meta Ad Library API (Graph API /ads_archive).
 * Requer META_ACCESS_TOKEN de uma app Meta com identidade verificada (gratuito):
 * https://www.facebook.com/ads/library/api
 *
 * Limitações da API pública (não contornadas):
 *  - Não devolve ficheiros de vídeo/imagem, CTA nem URL de destino completo.
 *  - Para anúncios comerciais só devolve anúncios entregues na UE (DSA).
 */

const DEFAULT_GRAPH_VERSION = "v23.0";
const DEFAULT_COUNTRIES = ["PT", "ES", "FR", "DE", "IT", "NL", "BE", "IE", "AT", "PL", "SE", "DK", "FI"];
const MAX_PAGES = 5;
const PAGE_LIMIT = 100;

const FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_creation_time",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "ad_creative_bodies",
  "ad_creative_link_captions",
  "ad_creative_link_titles",
  "publisher_platforms",
].join(",");

export const metaAdSchema = z.object({
  id: z.string(),
  page_id: z.string().optional(),
  page_name: z.string().optional(),
  ad_creation_time: z.string().optional(),
  ad_delivery_start_time: z.string().optional(),
  ad_delivery_stop_time: z.string().optional(),
  ad_creative_bodies: z.array(z.string()).optional(),
  ad_creative_link_captions: z.array(z.string()).optional(),
  ad_creative_link_titles: z.array(z.string()).optional(),
  publisher_platforms: z.array(z.string()).optional(),
});

export type MetaAd = z.infer<typeof metaAdSchema>;

const metaPageSchema = z.object({
  data: z.array(z.unknown()),
  paging: z.object({ next: z.string().url().optional() }).optional(),
});

const metaErrorSchema = z.object({
  error: z.object({ message: z.string(), code: z.number().optional(), error_subcode: z.number().optional(), type: z.string().optional() }),
});

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export function isMetaConfigured(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN?.trim());
}

/**
 * Aceita um Page ID numérico ou um link da Ad Library / página com view_all_page_id=… ou id=….
 * Devolve null se não encontrar um ID numérico.
 */
export function parsePageId(input: string): string | null {
  const value = input.trim();
  if (/^\d{5,25}$/.test(value)) return value;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    for (const key of ["view_all_page_id", "page_id", "id"]) {
      const v = url.searchParams.get(key);
      if (v && /^\d{5,25}$/.test(v)) return v;
    }
    const pathId = url.pathname.split("/").find((part) => /^\d{5,25}$/.test(part));
    return pathId ?? null;
  } catch {
    return null;
  }
}

function countries(): string[] {
  const raw = process.env.META_AD_COUNTRIES?.trim();
  if (!raw) return DEFAULT_COUNTRIES;
  const list = raw
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  return list.length > 0 ? list : DEFAULT_COUNTRIES;
}

/** Descarrega todos os anúncios ativos de uma página (até MAX_PAGES × PAGE_LIMIT). */
export async function fetchActiveAds(pageId: string): Promise<MetaAd[]> {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  if (!token) throw new MetaApiError("META_ACCESS_TOKEN não está configurado no servidor.", 500);
  const version = process.env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;

  const params = new URLSearchParams({
    access_token: token,
    search_page_ids: JSON.stringify([pageId]),
    ad_reached_countries: JSON.stringify(countries()),
    ad_active_status: "ACTIVE",
    ad_type: "ALL",
    fields: FIELDS,
    limit: String(PAGE_LIMIT),
  });
  let url: string | null = `https://graph.facebook.com/${version}/ads_archive?${params.toString()}`;
  const ads: MetaAd[] = [];

  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const response: Response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsedError = metaErrorSchema.safeParse(json);
      const message = parsedError.success ? parsedError.data.error.message : `HTTP ${response.status}`;
      // A mensagem da Meta pode ecoar parâmetros; nunca incluir o token.
      throw new MetaApiError(`Meta Ad Library: ${message.replaceAll(token, "***")}`, response.status, parsedError.success ? parsedError.data.error.code : undefined);
    }
    const parsed = metaPageSchema.safeParse(json);
    if (!parsed.success) throw new MetaApiError("Meta Ad Library devolveu um formato inesperado.", 502);
    for (const raw of parsed.data.data) {
      const ad = metaAdSchema.safeParse(raw);
      if (ad.success) ads.push(ad.data);
    }
    url = parsed.data.paging?.next ?? null;
  }
  return ads;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface CreativeGroup {
  /** Anúncio representativo (o mais antigo do grupo). */
  representative: MetaAd;
  copies: number;
  firstActiveDate: string;
  platforms: string[];
}

function startDateOf(ad: MetaAd): string {
  const raw = ad.ad_delivery_start_time ?? ad.ad_creation_time;
  const date = raw ? new Date(raw) : new Date();
  return (Number.isFinite(date.getTime()) ? date : new Date()).toISOString().slice(0, 10);
}

/**
 * Agrupa anúncios com criativo idêntico (mesmo texto principal + título + domínio).
 * O nº de anúncios no grupo é o active_copies_count.
 */
export function groupCreatives(ads: readonly MetaAd[]): CreativeGroup[] {
  const groups = new Map<string, MetaAd[]>();
  for (const ad of ads) {
    const body = normalizeText(ad.ad_creative_bodies?.[0]);
    const title = normalizeText(ad.ad_creative_link_titles?.[0]);
    const caption = normalizeText(ad.ad_creative_link_captions?.[0]);
    const key = body || title ? `${body}|${title}|${caption}` : `id:${ad.id}`;
    groups.set(key, [...(groups.get(key) ?? []), ad]);
  }

  return [...groups.values()].map((members) => {
    const sorted = [...members].sort((a, b) => startDateOf(a).localeCompare(startDateOf(b)) || a.id.localeCompare(b.id));
    const representative = sorted[0] as MetaAd;
    return {
      representative,
      copies: members.length,
      firstActiveDate: startDateOf(representative),
      platforms: [...new Set(members.flatMap((m) => m.publisher_platforms ?? []))].map((p) => p.toLowerCase()),
    };
  });
}

/** O "caption" do Meta é normalmente o domínio mostrado no anúncio (ex.: LOJA.COM). */
export function landingFromCaption(caption: string | undefined): string | null {
  const value = caption?.trim().toLowerCase();
  if (!value) return null;
  const host = value.replace(/^https?:\/\//, "").split(/[/\s]/)[0] ?? "";
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? `https://${host}` : null;
}

export function metaLibraryAdUrl(adArchiveId: string): string {
  return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(adArchiveId)}`;
}

export interface AdsSyncResult {
  pageId: string;
  pageName: string | null;
  fetchedAds: number;
  creatives: number;
  newCreatives: number;
  updatedCreatives: number;
  deactivated: number;
  scaling: number;
}

/**
 * Sincroniza os criativos de uma página para um utilizador.
 * Upsert em lote (um registo por criativo agrupado), recalcula Winner Score e marca como inativos
 * os criativos desta página que deixaram de aparecer. video_url/thumbnail_url definidos manualmente são preservados.
 * Funciona com o cliente RLS (rota) ou service role (cron): todas as queries filtram por user_id.
 */
export async function syncPageAds(supabase: TypedSupabaseClient, params: { userId: string; pageId: string; targetId: string | null; now?: Date }): Promise<AdsSyncResult> {
  const now = params.now ?? new Date();
  const ads = await fetchActiveAds(params.pageId);
  const groups = groupCreatives(ads);

  const { data: existingRows, error: existingError } = await supabase
    .from("spy_ad_creatives")
    .select("ad_archive_id, is_active")
    .eq("user_id", params.userId)
    .eq("page_id", params.pageId);
  if (existingError) throw new Error(existingError.message);
  const existing = new Set(existingRows.map((r) => r.ad_archive_id));

  const nowIso = now.toISOString();
  let scaling = 0;
  const rows: SpyAdCreativeInsert[] = groups.map((g) => {
    const score = calculateAdWinnerScore({ firstActiveDate: g.firstActiveDate, activeCopiesCount: g.copies }, now);
    if (score.isScaling) scaling += 1;
    const ad = g.representative;
    return {
      user_id: params.userId,
      target_id: params.targetId,
      page_id: params.pageId,
      page_name: ad.page_name ?? null,
      ad_archive_id: ad.id,
      ad_caption: ad.ad_creative_bodies?.[0]?.slice(0, 5000) ?? null,
      headline: ad.ad_creative_link_titles?.[0]?.slice(0, 500) ?? null,
      landing_page_url: landingFromCaption(ad.ad_creative_link_captions?.[0]),
      ad_platforms: g.platforms,
      first_active_date: g.firstActiveDate,
      days_active: score.daysActive,
      active_copies_count: g.copies,
      winner_score: score.winnerScore,
      is_scaling: score.isScaling,
      is_active: true,
      updated_at: nowIso,
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("spy_ad_creatives").upsert(rows.slice(i, i + 500), { onConflict: "user_id,ad_archive_id" });
    if (error) throw new Error(error.message);
  }

  const seen = new Set(rows.map((r) => r.ad_archive_id));
  const toDeactivate = existingRows.filter((r) => r.is_active !== false && !seen.has(r.ad_archive_id)).map((r) => r.ad_archive_id);
  if (toDeactivate.length > 0) {
    const { error } = await supabase.from("spy_ad_creatives").update({ is_active: false, updated_at: nowIso }).eq("user_id", params.userId).in("ad_archive_id", toDeactivate);
    if (error) throw new Error(error.message);
  }

  const newCreatives = rows.filter((r) => !existing.has(r.ad_archive_id)).length;
  return {
    pageId: params.pageId,
    pageName: groups[0]?.representative.page_name ?? null,
    fetchedAds: ads.length,
    creatives: rows.length,
    newCreatives,
    updatedCreatives: rows.length - newCreatives,
    deactivated: toDeactivate.length,
    scaling,
  };
}
