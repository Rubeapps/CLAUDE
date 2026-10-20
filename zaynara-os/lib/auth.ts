import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isEmailAllowed } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
}

/**
 * Data Access Layer: valida a sessão junto do Supabase Auth (não confia só no
 * cookie) e aplica a lista branca. Usar em todas as páginas e Server Actions.
 */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) redirect("/login");
  if (!isEmailAllowed(data.user.email)) redirect("/auth/signout?error=not_allowed");

  return { id: data.user.id, email: data.user.email ?? "" };
});
