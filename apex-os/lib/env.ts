import { z } from "zod";

/**
 * Validação de variáveis de ambiente. As públicas são lidas de forma literal
 * (process.env.NEXT_PUBLIC_*) para que o Next.js as possa embutir no bundle do browser.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export function getPublicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      "Variáveis Supabase em falta: define NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (ver .env.example).",
    );
  }
  return parsed.data;
}

/** Lê uma variável obrigatória só do servidor. Lança erro descritivo se faltar. */
export function requireServerEnv(
  name: "SUPABASE_SERVICE_ROLE_KEY" | "SHOPIFY_WEBHOOK_SECRET" | "CRON_SECRET" | "TELEGRAM_BOT_TOKEN" | "TELEGRAM_CHAT_ID",
): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Variável de ambiente em falta: ${name} (ver .env.example).`);
  }
  return value.trim();
}

export function optionalServerEnv(name: "TELEGRAM_BOT_TOKEN" | "TELEGRAM_CHAT_ID" | "NEXT_PUBLIC_SITE_URL"): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
