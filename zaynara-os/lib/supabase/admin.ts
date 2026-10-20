import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Cliente com a secret key: IGNORA o RLS. Usar apenas em cron jobs e na
 * ingestão de documentos, nunca com input do utilizador sem validação.
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } = env();
  if (!SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY não definida");
  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
