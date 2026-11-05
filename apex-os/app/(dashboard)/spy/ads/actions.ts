"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess, formToObject, zodMessage, type ActionState } from "@/lib/action-state";
import { calculateAdWinnerScore } from "@/lib/calculations/ad-scoring";
import type { SpyAdCreativeInsert } from "@/lib/database.types";
import { fallbackPageId, parseLibraryPayload } from "@/lib/spy/ad-library-import";
import { pageIdFromLibraryUrl, parseLibraryCard, type ParsedLibraryAd } from "@/lib/spy/ad-library-parser";
import { requireUser } from "@/lib/supabase/server";

const optionalHttpsUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https:\/\/\S+$/i.test(v), "tem de ser um link https://")
  .transform((v) => (v === "" ? null : v));

const mediaSchema = z.object({
  id: z.string().uuid(),
  video_url: optionalHttpsUrl,
  thumbnail_url: optionalHttpsUrl,
});


/** A Ad Library API não devolve ficheiros: o utilizador pode colar o link do MP4 / imagem do criativo. */
export async function updateAdMedia(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = mediaSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("spy_ad_creatives")
    .update({ video_url: parsed.data.video_url, thumbnail_url: parsed.data.thumbnail_url, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return actionError(error.message);
  if (data.length === 0) return actionError("Criativo não encontrado.");
  revalidatePath("/spy/ads");
  return actionSuccess("Media guardada.");
}

/** Criativos inativos há mais de N dias são apagados em cada importação (poupa espaço no Supabase gratuito). */
const INACTIVE_RETENTION_DAYS = 60;
const MAX_CAPTION = 2000;

const importSchema = z.object({
  payload: z.string().min(2, "cola o conteúdo copiado pelo botão").max(2_000_000, "conteúdo demasiado grande"),
  target_id: z.union([z.literal(""), z.string().uuid()]).optional(),
});

/**
 * Importa anúncios capturados na Meta Ad Library pelo botão "Enviar para o Apex".
 * Upsert por (user_id, ad_archive_id) com Winner Score; só guarda texto e links (sem ficheiros).
 */
export async function importLibraryAds(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsedForm = importSchema.safeParse(formToObject(formData));
  if (!parsedForm.success) return actionError(zodMessage(parsedForm.error));
  const payloadResult = parseLibraryPayload(parsedForm.data.payload);
  if (!payloadResult.ok) return actionError(payloadResult.error);
  const payload = payloadResult.payload;

  const byId = new Map<string, ParsedLibraryAd>();
  for (const card of payload.cards) {
    const ad = parseLibraryCard(card);
    if (ad && !byId.has(ad.adArchiveId)) byId.set(ad.adArchiveId, ad);
  }
  const ads = [...byId.values()];
  if (ads.length === 0) {
    return actionError("Não consegui ler nenhum anúncio (sem \"Library ID\" no texto). A Meta pode ter mudado o layout: avisa-me para ajustar o leitor.");
  }

  const { supabase, user } = await requireUser();
  let targetId: string | null = null;
  let targetPageId: string | null = null;
  if (parsedForm.data.target_id) {
    const { data: target } = await supabase.from("spy_targets").select("id, meta_page_id").eq("id", parsedForm.data.target_id).eq("user_id", user.id).maybeSingle();
    if (!target) return actionError("Loja não encontrada.");
    targetId = target.id;
    targetPageId = target.meta_page_id;
  }

  const pageName = ads.find((a) => a.pageName)?.pageName ?? null;
  const pageId = pageIdFromLibraryUrl(payload.url) ?? targetPageId ?? fallbackPageId(pageName);
  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);

  const { data: existing, error: existingError } = await supabase
    .from("spy_ad_creatives")
    .select("ad_archive_id")
    .eq("user_id", user.id)
    .in(
      "ad_archive_id",
      ads.map((a) => a.adArchiveId),
    );
  if (existingError) return actionError(existingError.message);
  const existingIds = new Set(existing.map((r) => r.ad_archive_id));

  let undated = 0;
  let scaling = 0;
  const rows: SpyAdCreativeInsert[] = ads.map((ad) => {
    if (!ad.startDate) undated += 1;
    const firstActive = ad.startDate ?? today;
    const score = calculateAdWinnerScore({ firstActiveDate: firstActive, activeCopiesCount: ad.copies }, now);
    if (score.isScaling) scaling += 1;
    return {
      user_id: user.id,
      target_id: targetId,
      page_id: pageId,
      page_name: ad.pageName ?? pageName,
      ad_archive_id: ad.adArchiveId,
      ad_caption: ad.caption ? ad.caption.slice(0, MAX_CAPTION) : null,
      headline: ad.headline,
      landing_page_url: ad.landingUrl,
      video_url: ad.videoUrl,
      thumbnail_url: ad.thumbnailUrl,
      first_active_date: firstActive,
      days_active: score.daysActive,
      active_copies_count: ad.copies,
      winner_score: score.winnerScore,
      is_scaling: score.isScaling,
      is_active: ad.isActive,
      updated_at: nowIso,
    };
  });

  const { error } = await supabase.from("spy_ad_creatives").upsert(rows, { onConflict: "user_id,ad_archive_id" });
  if (error) return actionError(error.message);

  // Limpeza: criativos inativos e não atualizados há mais de 60 dias.
  const cutoff = new Date(now.getTime() - INACTIVE_RETENTION_DAYS * 86_400_000).toISOString();
  await supabase.from("spy_ad_creatives").delete().eq("user_id", user.id).eq("is_active", false).lt("updated_at", cutoff);

  revalidatePath("/spy/ads");
  const created = rows.filter((r) => !existingIds.has(r.ad_archive_id)).length;
  const videos = rows.filter((r) => r.video_url).length;
  return actionSuccess(
    `${rows.length} criativos de ${pageName ?? "página"} importados (${created} novos, ${rows.length - created} atualizados, ${scaling} em escala, ${videos} com vídeo)` +
      (undated > 0 ? `. ${undated} sem data legível ficaram com data de hoje.` : "."),
  );
}
