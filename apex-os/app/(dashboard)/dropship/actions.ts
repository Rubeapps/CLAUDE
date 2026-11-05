"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess, formNumber, formToObject, zodMessage, type ActionState } from "@/lib/action-state";
import { calculateAdFatigue } from "@/lib/calculations/engine";
import { COUNTRY_CATALOG } from "@/lib/countries";
import type { DropshipAdCreativeInsert, Json } from "@/lib/database.types";
import { productIdeaInputsSchema } from "@/lib/product-ideas";
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

/* ─── Portes por país ─────────────────────────────────────────────────────── */

const countrySchema = z.object({
  country_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "código de país com 2 letras (ex.: DE)"),
  name: z.string().trim().max(60).optional(),
});

export async function addShippingCountry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = countrySchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const code = parsed.data.country_code;
  const name = parsed.data.name && parsed.data.name.length > 0 ? parsed.data.name : (COUNTRY_CATALOG.find((c) => c.code === code)?.name ?? code);
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("dropship_shipping_countries").insert({ user_id: user.id, country_code: code, name });
  if (error) return actionError(error.code === "23505" ? `${name} já está na lista.` : error.message);
  revalidate();
  return actionSuccess(`${name} adicionado.`);
}

export async function removeShippingCountry(formData: FormData): Promise<void> {
  const parsed = countrySchema.pick({ country_code: true }).safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("dropship_shipping_rates").delete().eq("user_id", user.id).eq("country_code", parsed.data.country_code);
  await supabase.from("dropship_shipping_countries").delete().eq("user_id", user.id).eq("country_code", parsed.data.country_code);
  revalidate();
}

function optionalMoney(raw: FormDataEntryValue | null): number | null | "invalid" {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 99_999_999 ? n : "invalid";
}

/**
 * Guarda os portes por país de um produto. Campos: rate_<PAÍS>_1, rate_<PAÍS>_2, rate_<PAÍS>_3.
 * País com "1 un." vazio ⇒ volta a usar os portes por defeito.
 */
export async function saveCountryRates(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const productName = formData.get("product_name");
  if (typeof productName !== "string" || productName.trim() === "") return actionError("Produto inválido.");
  const { supabase, user } = await requireUser();

  const { data: countries, error: countriesError } = await supabase.from("dropship_shipping_countries").select("country_code, name").eq("user_id", user.id);
  if (countriesError) return actionError(countriesError.message);

  const upserts: { user_id: string; product_name: string; country_code: string; shipping_1: number; shipping_2: number | null; shipping_3: number | null; updated_at: string }[] = [];
  const clear: string[] = [];
  for (const c of countries) {
    const s1 = optionalMoney(formData.get(`rate_${c.country_code}_1`));
    const s2 = optionalMoney(formData.get(`rate_${c.country_code}_2`));
    const s3 = optionalMoney(formData.get(`rate_${c.country_code}_3`));
    if (s1 === "invalid" || s2 === "invalid" || s3 === "invalid") return actionError(`Valor inválido em ${c.name}.`);
    if (s1 === null) {
      clear.push(c.country_code);
      continue;
    }
    if ((s2 !== null && s2 < s1) || (s3 !== null && s3 < (s2 ?? s1))) return actionError(`${c.name}: os portes de 2/3 unidades não podem ser menores que os do escalão anterior.`);
    upserts.push({ user_id: user.id, product_name: productName, country_code: c.country_code, shipping_1: s1, shipping_2: s2, shipping_3: s3, updated_at: new Date().toISOString() });
  }

  if (upserts.length > 0) {
    const { error } = await supabase.from("dropship_shipping_rates").upsert(upserts, { onConflict: "user_id,product_name,country_code" });
    if (error) return actionError(error.message);
  }
  if (clear.length > 0) {
    const { error } = await supabase.from("dropship_shipping_rates").delete().eq("user_id", user.id).eq("product_name", productName).in("country_code", clear);
    if (error) return actionError(error.message);
  }
  revalidate();
  return actionSuccess(`Portes guardados: ${upserts.length} ${upserts.length === 1 ? "país com valor próprio" : "países com valor próprio"}, os restantes usam o padrão.`);
}

/* ─── Calculadora de produtos (ideias) ────────────────────────────────────── */

const ideaSchema = z.object({
  id: z.union([z.literal(""), z.string().uuid()]).optional(),
  name: z.string().trim().min(1, "dá um nome ao produto").max(120),
  inputs: z.string().max(20_000),
});

export async function saveProductIdea(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ideaSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  let json: unknown;
  try {
    json = JSON.parse(parsed.data.inputs);
  } catch {
    return actionError("Dados da calculadora inválidos.");
  }
  const inputs = productIdeaInputsSchema.safeParse(json);
  if (!inputs.success) return actionError(zodMessage(inputs.error));
  const value: Json = inputs.data;
  const { supabase, user } = await requireUser();
  const now = new Date().toISOString();
  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("dropship_product_ideas")
      .update({ name: parsed.data.name, inputs: value, updated_at: now })
      .eq("id", parsed.data.id)
      .eq("user_id", user.id)
      .select("id");
    if (error) return actionError(error.message);
    if (data.length === 0) return actionError("Produto não encontrado.");
  } else {
    const { error } = await supabase.from("dropship_product_ideas").insert({ user_id: user.id, name: parsed.data.name, inputs: value, updated_at: now });
    if (error) return actionError(error.message);
  }
  revalidate();
  return actionSuccess(`"${parsed.data.name}" guardado.`);
}

export async function deleteProductIdea(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("dropship_product_ideas").delete().eq("id", parsed.data.id).eq("user_id", user.id);
  revalidate();
}
