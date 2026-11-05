"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess, formNumber, formToObject, zodMessage, type ActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/supabase/server";

const pct = formNumber.pipe(z.number().min(0, "mínimo 0").max(100, "máximo 100"));

const warChestSchema = z
  .object({
    reinvest_percent: pct,
    emergency_tax_percent: pct,
    trading_injection_percent: pct,
    current_cash_reserve: formNumber.pipe(z.number().min(0, "não pode ser negativa").max(9_999_999_999.99)),
  })
  .refine((v) => Math.round((v.reinvest_percent + v.emergency_tax_percent + v.trading_injection_percent) * 100) === 10000, {
    message: "As três percentagens têm de somar 100%.",
    path: ["reinvest_percent"],
  });

export async function saveWarChest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = warChestSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("war_chest_settings")
    .upsert({ user_id: user.id, ...parsed.data, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return actionError(error.message);
  revalidatePath("/dashboard");
  return actionSuccess("War Chest atualizado.");
}
