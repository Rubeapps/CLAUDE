"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess, formNumber, formToObject, zodMessage, type ActionState } from "@/lib/action-state";
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
