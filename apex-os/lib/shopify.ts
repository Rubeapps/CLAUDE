import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/* ─── HMAC (X-Shopify-Hmac-Sha256) ─────────────────────────────────────────── */

/**
 * Valida a assinatura de um webhook Shopify: base64(HMAC-SHA256(rawBody, secret)).
 * Comparação em tempo constante para evitar timing attacks.
 */
export function verifyShopifyHmac(rawBody: string | Buffer, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader || secret.length === 0) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(hmacHeader.trim(), "base64");
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/* ─── Webhook de encomendas ───────────────────────────────────────────────── */

const moneyString = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    ctx.addIssue({ code: "custom", message: "Valor monetário inválido" });
    return z.NEVER;
  }
  return parsed;
});

export const shopifyOrderWebhookSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string().optional(),
  order_number: z.union([z.number(), z.string()]).transform(String),
  total_price: moneyString,
  currency: z.string().min(3).max(3),
  gateway: z.string().nullish(),
  payment_gateway_names: z.array(z.string()).nullish(),
  financial_status: z.string().nullish(),
  created_at: z.string(),
  line_items: z.array(
    z.object({
      sku: z.string().nullish(),
      quantity: z.number().int().nonnegative(),
    }),
  ),
});

export type ShopifyOrderWebhook = z.infer<typeof shopifyOrderWebhookSchema>;

export const SUPPORTED_ORDER_TOPICS = new Set(["orders/create", "orders/updated", "orders/paid", "orders/cancelled"]);

export function resolveOrderGateway(order: ShopifyOrderWebhook): string {
  const fromList = order.payment_gateway_names?.find((name) => name.trim().length > 0);
  return (fromList ?? order.gateway ?? "unknown").trim() || "unknown";
}

/* ─── Storefront /products.json ───────────────────────────────────────────── */

const nullableMoney = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  });

export const shopifyStorefrontProductSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  handle: z.string(),
  published_at: z.string().nullish(),
  tags: z
    .union([z.array(z.string()), z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (Array.isArray(value)) return value.map((t) => t.trim()).filter(Boolean);
      if (typeof value === "string") return value.split(",").map((t) => t.trim()).filter(Boolean);
      return [];
    }),
  images: z.array(z.object({ src: z.string().url() })).default([]),
  variants: z
    .array(
      z.object({
        price: nullableMoney,
        compare_at_price: nullableMoney,
        available: z.boolean().optional().default(true),
      }),
    )
    .default([]),
});

export const shopifyProductsResponseSchema = z.object({
  products: z.array(z.unknown()),
});

export type ShopifyStorefrontProduct = z.infer<typeof shopifyStorefrontProductSchema>;

export interface ProductSnapshot {
  shopifyProductId: number;
  title: string;
  handle: string;
  currentPrice: number;
  compareAtPrice: number | null;
  /** false = rutura de stock (todas as variantes com available: false). */
  isAvailable: boolean;
  imageUrl: string | null;
  publishedAt: string | null;
  tags: string[];
  /** Nº de variantes com available: true (mudança entre scans = movimento de stock). */
  availableVariants: number;
  totalVariants: number;
}

/** Tags que as lojas usam para destacar produtos a vender bem. */
const SCALING_TAG_PATTERN = /best[\s_-]?sell|top[\s_-]?sell|trending|hot[\s_-]?(item|product|seller)|most[\s_-]?popular|viral/i;

export function hasScalingTag(tags: readonly string[]): boolean {
  return tags.some((tag) => SCALING_TAG_PATTERN.test(tag));
}

/**
 * Normaliza um produto: preço = variante mais barata; compare_at do mesmo variant;
 * disponível se pelo menos uma variante estiver disponível.
 */
export function toProductSnapshot(product: ShopifyStorefrontProduct): ProductSnapshot | null {
  const priced = product.variants.filter((v): v is typeof v & { price: number } => v.price !== null);
  if (priced.length === 0) return null;
  const cheapest = priced.reduce((min, v) => (v.price < min.price ? v : min));
  return {
    shopifyProductId: product.id,
    title: product.title,
    handle: product.handle,
    currentPrice: Math.round(cheapest.price * 100) / 100,
    compareAtPrice: cheapest.compare_at_price !== null ? Math.round(cheapest.compare_at_price * 100) / 100 : null,
    isAvailable: product.variants.length > 0 && product.variants.some((v) => v.available),
    imageUrl: product.images[0]?.src ?? null,
    publishedAt: product.published_at ?? null,
    tags: product.tags,
    availableVariants: product.variants.filter((v) => v.available).length,
    totalVariants: product.variants.length,
  };
}

/**
 * Normaliza o URL de uma loja para "https://dominio" (sem path, query ou barra final).
 * Devolve null se não for um URL http(s) válido.
 */
export function normalizeStoreUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return `https://${url.hostname.toLowerCase()}`;
  } catch {
    return null;
  }
}

/** Normaliza um domínio myshopify (ex.: "Loja.myshopify.com/" → "loja.myshopify.com"). */
export function normalizeShopDomain(input: string): string | null {
  const url = normalizeStoreUrl(input);
  if (!url) return null;
  const host = url.replace(/^https:\/\//, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host) ? host : null;
}

const USER_AGENT = "Mozilla/5.0 (compatible; ApexOS-SpyEngine/1.0; +https://github.com)";

export interface FetchProductsResult {
  products: ProductSnapshot[];
  skipped: number;
}

/**
 * Descarrega /products.json?limit=250 paginado (até maxPages) de uma loja Shopify pública.
 * Lança Error com mensagem clara em caso de HTTP != 200 ou JSON inválido.
 */
export async function fetchStoreProducts(storeUrl: string, maxPages = 10): Promise<FetchProductsResult> {
  const products: ProductSnapshot[] = [];
  let skipped = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${storeUrl.replace(/\/$/, "")}/products.json?limit=250&page=${page}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 404) throw new Error(`${storeUrl} não expõe /products.json (não é Shopify ou está bloqueado).`);
    if (response.status === 429) throw new Error(`${storeUrl} devolveu 429 (rate limit). Tenta novamente mais tarde.`);
    if (!response.ok) throw new Error(`${storeUrl} devolveu HTTP ${response.status}.`);

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) throw new Error(`${storeUrl} não devolveu JSON (possível password page ou proteção anti-bot).`);

    const envelope = shopifyProductsResponseSchema.safeParse(await response.json());
    if (!envelope.success) throw new Error(`${storeUrl}: formato de /products.json inesperado.`);

    for (const raw of envelope.data.products) {
      const parsed = shopifyStorefrontProductSchema.safeParse(raw);
      const snapshot = parsed.success ? toProductSnapshot(parsed.data) : null;
      if (snapshot) products.push(snapshot);
      else skipped += 1;
    }

    if (envelope.data.products.length < 250) break;
  }

  return { products, skipped };
}
