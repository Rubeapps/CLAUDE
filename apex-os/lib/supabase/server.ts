import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Database } from "@/lib/database.types";
import { getPublicEnv, requireServerEnv } from "@/lib/env";

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Cliente para Server Components, Server Actions e Route Handlers.
 * Usa a chave anon + cookies de sessão ⇒ todas as queries passam pelo RLS (auth.uid()).
 */
export async function createClient(): Promise<TypedSupabaseClient> {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chamado a partir de um Server Component (cookies só de leitura):
          // o middleware já renova a sessão, por isso é seguro ignorar.
        }
      },
    },
  });
}

/** Devolve o cliente RLS + o utilizador autenticado, ou redireciona para /login. */
export async function requireUser(): Promise<{ supabase: TypedSupabaseClient; user: User }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect("/login");
  }
  return { supabase, user: data.user };
}

/**
 * Cliente com service role — APENAS para processos sem sessão (webhook Shopify, cron Spy).
 * Contorna o RLS, por isso cada query feita com ele TEM de filtrar por user_id/target_id explícito.
 */
export function createServiceClient(): TypedSupabaseClient {
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  const serviceKey = requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createSupabaseClient<Database>(NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
