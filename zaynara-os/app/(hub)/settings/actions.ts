"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  ok: boolean;
  message: string;
}

const settingsSchema = z.object({
  vat_mode: z.enum(["exempt", "pt_standard", "oss"]),
  vat_rate: z.coerce.number().min(0).max(30),
  default_shipping_mode: z.enum(["together", "separate"]),
});

export async function saveBusinessSettings(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Valores inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_settings")
    .upsert({ user_id: user.id, ...parsed.data }, { onConflict: "user_id" });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/", "layout");
  return { ok: true, message: "Definições guardadas." };
}

const SHOPIFY_PRODUCT_ID = /^gid:\/\/shopify\/Product\/\d+$/;

/**
 * Recebe, por cada produto da Shopify, `map:<gid>` = id do cost_product (ou "")
 * e, por cada cost_product, `extra:<id>` = envio extra quando vai junto.
 */
export async function saveProductMapping(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const supabase = await createClient();

  const { data: products, error } = await supabase.from("cost_products").select("id");
  if (error) return { ok: false, message: error.message };
  const validIds = new Set((products ?? []).map((p) => p.id as string));

  const mapping = new Map<string, string[]>([...validIds].map((id) => [id, []]));
  for (const [field, value] of formData.entries()) {
    if (!field.startsWith("map:") || typeof value !== "string" || !value) continue;
    const shopifyId = field.slice(4);
    if (!SHOPIFY_PRODUCT_ID.test(shopifyId) || !validIds.has(value)) continue;
    mapping.get(value)!.push(shopifyId);
  }

  for (const [id, shopifyIds] of mapping) {
    const rawExtra = formData.get(`extra:${id}`);
    const extra =
      typeof rawExtra === "string" && rawExtra.trim() !== "" ? Number(rawExtra.replace(",", ".")) : null;
    if (extra !== null && (!Number.isFinite(extra) || extra < 0)) {
      return { ok: false, message: "O envio extra tem de ser um número positivo." };
    }

    const { error: updateError } = await supabase
      .from("cost_products")
      .update({ shopify_product_ids: shopifyIds, bundled_extra_shipping: extra })
      .eq("id", id);
    if (updateError) return { ok: false, message: updateError.message };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Associações guardadas." };
}
