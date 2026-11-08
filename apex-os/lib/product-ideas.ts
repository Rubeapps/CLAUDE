import { z } from "zod";
import type { Json } from "@/lib/database.types";

const money = z.number().min(0).max(1_000_000);
const optMoney = money.nullable();

export const shippingTiersSchema = z.object({ s1: money, s2: optMoney, s3: optMoney });
export type ShippingTiers = z.infer<typeof shippingTiersSchema>;

/** Chave dos portes por defeito (para países sem valor próprio). */
export const DEFAULT_SHIPPING_KEY = "DEFAULT";

export const productIdeaInputsSchema = z.object({
  unitPrice: money,
  /** Preço total da encomenda de 2 unidades (pack). Vazio ⇒ 2 × unitPrice. */
  price2: optMoney.optional(),
  /** Preço total da encomenda de 3 unidades (pack). Vazio ⇒ 3 × unitPrice. */
  price3: optMoney.optional(),
  unitCogs: money,
  cpa: money,
  vatPercent: z.number().min(0).max(30),
  targetMarginPercent: z.number().min(0).max(90),
  gatewayPercent: z.number().min(0).max(15),
  gatewayFixed: money,
  shipping: z.record(z.string().regex(/^(DEFAULT|[A-Z]{2})$/), shippingTiersSchema),
});

export type ProductIdeaInputs = z.infer<typeof productIdeaInputsSchema>;

export const DEFAULT_IDEA_INPUTS: ProductIdeaInputs = {
  unitPrice: 29.9,
  unitCogs: 6,
  cpa: 12,
  vatPercent: 0,
  targetMarginPercent: 20,
  gatewayPercent: 1.5,
  gatewayFixed: 0.25,
  shipping: { [DEFAULT_SHIPPING_KEY]: { s1: 4, s2: 6, s3: 7.5 } },
};

/** Lê o JSONB guardado com segurança; valores inválidos voltam aos de omissão. */
export function ideaInputsFromJson(value: Json): ProductIdeaInputs {
  const parsed = productIdeaInputsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_IDEA_INPUTS;
}

/** Portes para uma quantidade a partir de um escalão (2 e 3 extrapolados se vazios). */
export function shippingForQuantity(tiers: ShippingTiers, quantity: number): number {
  const s2 = tiers.s2 ?? tiers.s1 * 2;
  const s3 = tiers.s3 ?? s2 + (s2 - tiers.s1);
  if (quantity <= 1) return tiers.s1;
  if (quantity === 2) return s2;
  return s3;
}
