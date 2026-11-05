"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { actionError, actionSuccess, formToObject, zodMessage, type ActionState } from "@/lib/action-state";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("e-mail inválido"),
  password: z.string().min(8, "mínimo 8 caracteres"),
  mode: z.enum(["signin", "signup"]),
  next: z.string().optional(),
});

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function authenticate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));

  const { email, password, mode, next } = parsed.data;
  const supabase = await createClient();

  if (mode === "signup") {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent(safeNext(next))}` },
    });
    if (error) return actionError(error.message);
    if (!data.session) return actionSuccess("Conta criada. Confirma o e-mail que te enviámos para entrar.");
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return actionError(error.message === "Invalid login credentials" ? "E-mail ou password incorretos." : error.message);
  }

  redirect(safeNext(next));
}
