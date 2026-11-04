"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess, formToObject, zodMessage, type ActionState } from "@/lib/action-state";
import { errorMessage } from "@/lib/http";
import { normalizeStoreUrl } from "@/lib/shopify";
import { scanTarget } from "@/lib/spy-engine";
import { requireUser } from "@/lib/supabase/server";

const targetSchema = z.object({
  store_name: z.string().trim().min(1, "obrigatório").max(120),
  store_url: z.string().trim().min(1, "obrigatório").max(300),
});

const idSchema = z.object({ id: z.string().uuid() });

function revalidate() {
  revalidatePath("/spy");
  revalidatePath("/dashboard");
}

/** Verifica que a loja expõe /products.json antes de a guardar. */
async function probeShopify(storeUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${storeUrl}/products.json?limit=1`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; ApexOS-SpyEngine/1.0)" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return `A loja respondeu HTTP ${res.status} em /products.json — não parece uma loja Shopify pública.`;
    if (!(res.headers.get("content-type") ?? "").includes("json")) return "A loja não devolveu JSON em /products.json (password page ou anti-bot).";
    return null;
  } catch (error) {
    return `Não foi possível contactar a loja: ${errorMessage(error)}`;
  }
}

export async function addTarget(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = targetSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const storeUrl = normalizeStoreUrl(parsed.data.store_url);
  if (!storeUrl) return actionError("URL inválido. Ex.: https://loja-concorrente.com");

  const probeError = await probeShopify(storeUrl);
  if (probeError) return actionError(probeError);

  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("spy_targets").insert({ user_id: user.id, store_name: parsed.data.store_name, store_url: storeUrl });
  if (error) return actionError(error.code === "23505" ? "Já estás a monitorizar esta loja." : error.message);
  revalidate();
  return actionSuccess(`${parsed.data.store_name} adicionada. Corre um scan para gravar o catálogo base.`);
}

export async function toggleTarget(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("spy_targets").select("is_active").eq("id", parsed.data.id).eq("user_id", user.id).maybeSingle();
  if (!data) return;
  await supabase.from("spy_targets").update({ is_active: !data.is_active }).eq("id", parsed.data.id).eq("user_id", user.id);
  revalidate();
}

export async function deleteTarget(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("spy_targets").delete().eq("id", parsed.data.id).eq("user_id", user.id);
  revalidate();
}

/** Scan manual de uma loja com a sessão do utilizador (RLS), com alertas Telegram. */
export async function scanNow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError("Loja inválida.");
  const { supabase, user } = await requireUser();
  const { data: target, error } = await supabase
    .from("spy_targets")
    .select("id, store_name, store_url, last_scraped_at")
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return actionError(error.message);
  if (!target) return actionError("Loja não encontrada.");

  const result = await scanTarget(supabase, target, true);
  revalidate();
  if (!result.ok) return actionError(result.error ?? "Scan falhou.");
  if (result.baseline) return actionSuccess(`Catálogo base: ${result.scanned} produtos gravados.`);
  return actionSuccess(`${result.scanned} produtos · ${result.newProducts} novos · ${result.priceChanges} preços · ${result.stockOuts} ruturas.`);
}
