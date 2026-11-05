"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess, formNumber, formToObject, zodMessage, type ActionState } from "@/lib/action-state";
import { checklistFromJson } from "@/lib/data/treasury";
import { requireUser } from "@/lib/supabase/server";

const pct = formNumber.pipe(z.number().min(0, "mínimo 0").max(100, "máximo 100"));

const vaultSchema = z.object({
  estimated_vat_percent: pct,
  estimated_income_tax_percent: pct,
  rolling_reserve_percent: pct,
});

const reconcileSchema = z.object({ total_tax_reserved: formNumber.pipe(z.number().min(0).max(9_999_999_999)) });

const checklistSchema = z.object({
  item: z
    .string()
    .trim()
    .regex(/^[a-z_]{2,40}$/),
  checked: z.boolean(),
});

function revalidate() {
  revalidatePath("/knowledge");
  revalidatePath("/dashboard");
}

export async function saveVaultSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = vaultSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("treasury_tax_vault").upsert({ user_id: user.id, ...parsed.data }, { onConflict: "user_id" });
  if (error) return actionError(error.message);
  revalidate();
  return actionSuccess("Taxas do cofre fiscal guardadas.");
}

/** Regista o valor reservado para o Estado à data de hoje (reconciliação manual). */
export async function reconcileVault(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = reconcileSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("treasury_tax_vault")
    .upsert({ user_id: user.id, total_tax_reserved: parsed.data.total_tax_reserved, last_reconciliation_date: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return actionError(error.message);
  revalidate();
  return actionSuccess("Reserva registada.");
}

/** Marca/desmarca um item do checklist de conformidade (guardado em JSONB por utilizador). */
export async function setChecklistItem(item: string, checked: boolean): Promise<ActionState> {
  const parsed = checklistSchema.safeParse({ item, checked });
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("treasury_tax_vault").select("compliance_checklist").eq("user_id", user.id).maybeSingle();
  if (error) return actionError(error.message);
  const current = data ? checklistFromJson(data.compliance_checklist) : {};
  const next = { ...current, [parsed.data.item]: parsed.data.checked };
  const { error: saveError } = await supabase.from("treasury_tax_vault").upsert({ user_id: user.id, compliance_checklist: next }, { onConflict: "user_id" });
  if (saveError) return actionError(saveError.message);
  revalidatePath("/knowledge");
  return actionSuccess("Guardado.");
}
