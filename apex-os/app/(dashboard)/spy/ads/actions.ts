"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess, formToObject, zodMessage, type ActionState } from "@/lib/action-state";
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
