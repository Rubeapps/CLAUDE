import "server-only";
import { z } from "zod";

// Variáveis de servidor. As integrações são opcionais: sem credenciais, o
// Dashboard mostra um aviso em vez de rebentar.
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const number = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? Number(v) : fallback))
    .pipe(z.number().finite());

const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: optional,
  ALLOWED_EMAILS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  APP_TIMEZONE: z.string().default("Europe/Lisbon"),

  SHOPIFY_STORE_DOMAIN: optional,
  SHOPIFY_ADMIN_ACCESS_TOKEN: optional,
  SHOPIFY_CLIENT_ID: optional,
  SHOPIFY_CLIENT_SECRET: optional,
  SHOPIFY_API_VERSION: z.string().default("2026-10"),
  LOW_STOCK_THRESHOLD: number(10),
  GATEWAY_FEE_PERCENT: number(0),
  GATEWAY_FEE_FIXED: number(0),

  META_ACCESS_TOKEN: optional,
  META_AD_ACCOUNT_ID: optional,
  META_API_VERSION: z.string().default("v24.0"),

  FX_USD_EUR_FALLBACK: number(0.86),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Variáveis de ambiente inválidas ou em falta: ${fields}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function isEmailAllowed(email: string | undefined | null) {
  const allowed = env().ALLOWED_EMAILS;
  // Lista vazia = só o Supabase decide (sign-ups desligados). Com lista, é obrigatória.
  if (allowed.length === 0) return true;
  return !!email && allowed.includes(email.toLowerCase());
}
