"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess, formNumber, formToObject, zodMessage, type ActionState } from "@/lib/action-state";
import { calculateAdFatigue } from "@/lib/calculations/engine";
import type { DropshipAdCreativeInsert } from "@/lib/database.types";
import { normalizeShopDomain } from "@/lib/shopify";
import { requireUser } from "@/lib/supabase/server";

const productSchema = z.object({
  sku: z.string().trim().min(1, "obrigatório").max(120),
  name: z.string().trim().min(1, "obrigatório").max(200),
  cogs: formNumber.pipe(z.number().min(0, "não pode ser negativo").max(99_999_999)),
  shipping_cost: formNumber.pipe(z.number().min(0, "não pode ser negativo").max(99_999_999)),
});

const adSpendSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida"),
  platform: z.enum(["META", "TIKTOK", "GOOGLE"]),
  amount: formNumber.pipe(z.number().min(0, "não pode ser negativo").max(99_999_999)),
});

const idSchema = z.object({ id: z.string().uuid() });

const storeSchema = z.object({ shop_domain: z.string().trim().min(1, "obrigatório") });

function revalidate() {
  revalidatePath("/dropship");
  revalidatePath("/dashboard");
}

export async function upsertProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = productSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("dropship_products").upsert({ user_id: user.id, ...parsed.data }, { onConflict: "user_id,sku" });
  if (error) return actionError(error.message);
  revalidate();
  return actionSuccess(`SKU ${parsed.data.sku} guardado.`);
}

const money = formNumber.pipe(z.number().min(0, "não pode ser negativo").max(99_999_999));

const productGroupSchema = z
  .object({
    name: z.string().trim().min(1, "obrigatório").max(200),
    cogs: money,
    shipping_cost: money,
    shipping_cost_2: money,
    shipping_cost_3: money,
  })
  .refine((v) => v.shipping_cost_2 >= v.shipping_cost && v.shipping_cost_3 >= v.shipping_cost_2, {
    message: "Os portes de 2 e 3 unidades não podem ser menores que os do escalão anterior.",
    path: ["shipping_cost_2"],
  });

/** Atualiza COGS e os 3 escalões de portes de todas as variantes (SKUs) de um produto de uma só vez. */
export async function updateProductGroupCosts(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = productGroupSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const { name, cogs, shipping_cost, shipping_cost_2, shipping_cost_3 } = parsed.data;
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("dropship_products")
    .update({ cogs, shipping_cost, shipping_cost_2, shipping_cost_3 })
    .eq("user_id", user.id)
    .eq("name", name)
    .select("id");
  if (error) return actionError(error.message);
  if (data.length === 0) return actionError("Produto não encontrado.");
  revalidate();
  return actionSuccess(`${data.length} ${data.length === 1 ? "variante atualizada" : "variantes atualizadas"}.`);
}

export async function deleteProduct(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("dropship_products").delete().eq("id", parsed.data.id).eq("user_id", user.id);
  revalidate();
}

export async function upsertAdSpend(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = adSpendSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("dropship_ad_spend").upsert({ user_id: user.id, ...parsed.data }, { onConflict: "user_id,date,platform" });
  if (error) return actionError(error.message);
  revalidate();
  return actionSuccess(`Ad spend ${parsed.data.platform} de ${parsed.data.date} guardado.`);
}

export async function deleteAdSpend(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("dropship_ad_spend").delete().eq("id", parsed.data.id).eq("user_id", user.id);
  revalidate();
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");

const creativeRowSchema = z.object({
  campaignName: z.string().trim().min(1).max(300),
  adName: z.string().trim().min(1).max(300),
  spend: z.number().min(0).max(99_999_999.99),
  impressions: z.number().int().min(0).max(2_147_483_647),
  videoPlays3s: z.number().int().min(0).max(2_147_483_647),
  thruplays: z.number().int().min(0).max(2_147_483_647),
  frequency: z.number().min(0).max(999.99),
  ctr: z.number().min(0).max(999.99),
  cpa: z.number().min(0).max(99_999_999.99),
  date: isoDate.nullable(),
});

const creativesPayloadSchema = z.object({
  breakEvenCpa: z.number().min(0).max(99_999_999),
  fallbackDate: isoDate,
  rows: z.array(creativeRowSchema).min(1, "o CSV não tem linhas válidas").max(2000, "máximo 2000 linhas por importação"),
});

/** Guarda uma importação CSV do Meta Ads. O is_fatigued é recalculado no servidor. */
export async function saveAdCreatives(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return actionError("Payload em falta.");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return actionError("Payload inválido.");
  }
  const parsed = creativesPayloadSchema.safeParse(json);
  if (!parsed.success) return actionError(zodMessage(parsed.error));

  const { supabase, user } = await requireUser();
  const { breakEvenCpa, fallbackDate } = parsed.data;

  // Deduplica (data, campanha, anúncio): a última linha ganha, como no upsert.
  const byKey = new Map<string, DropshipAdCreativeInsert>();
  for (const r of parsed.data.rows) {
    const date = r.date ?? fallbackDate;
    const fatigue = calculateAdFatigue({ impressions: r.impressions, videoPlays3s: r.videoPlays3s, thruplays: r.thruplays, frequency: r.frequency, ctr: r.ctr, cpa: r.cpa, breakEvenCpa });
    byKey.set(`${date}|${r.campaignName}|${r.adName}`, {
      user_id: user.id,
      campaign_name: r.campaignName,
      ad_name: r.adName,
      spend: r.spend,
      impressions: r.impressions,
      video_plays_3s: r.videoPlays3s,
      thruplays: r.thruplays,
      frequency: r.frequency,
      ctr: r.ctr,
      cpa: r.cpa,
      date,
      is_fatigued: fatigue.isFatigued,
    });
  }
  const rows = [...byKey.values()];

  const { error } = await supabase.from("dropship_ad_creatives").upsert(rows, { onConflict: "user_id,date,campaign_name,ad_name" });
  if (error) return actionError(error.message);
  revalidate();
  const fatigued = rows.filter((r) => r.is_fatigued).length;
  return actionSuccess(`${rows.length} criativos guardados · ${fatigued} em fadiga crítica.`);
}

export async function connectStore(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = storeSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const domain = normalizeShopDomain(parsed.data.shop_domain);
  if (!domain) return actionError("Usa o domínio myshopify, ex.: a-minha-loja.myshopify.com");
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("dropship_stores").insert({ user_id: user.id, shop_domain: domain });
  if (error) {
    return actionError(error.code === "23505" ? "Esta loja já está ligada a uma conta." : error.message);
  }
  revalidate();
  return actionSuccess(`${domain} ligada. Configura o webhook no Shopify.`);
}

export async function disconnectStore(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("dropship_stores").delete().eq("id", parsed.data.id).eq("user_id", user.id);
  revalidate();
}
