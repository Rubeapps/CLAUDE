// Custo real de uma encomenda (produto + envio do fornecedor), por país e
// quantidade. Funções puras: sem I/O, sem IA — os dados vêm de
// `current_supplier_rates` e as taxas de câmbio são passadas pelo chamador.

export type ShippingMode = "together" | "separate";

export interface SupplierRate {
  productKey: string;
  country: string; // ISO 3166-1 alpha-2
  quantity: number;
  productCost: number;
  shippingCost: number;
  currency: string;
}

export interface CostProduct {
  key: string;
  currency: string;
  /** Envio extra por unidade quando segue no pacote do produto principal. */
  bundledExtraShipping: number | null;
}

export interface OrderLine {
  productKey: string;
  quantity: number;
}

export interface CostContext {
  rates: SupplierRate[];
  products: CostProduct[];
  primaryProductKey: string;
  /** Multiplicador para EUR por moeda, ex: { EUR: 1, USD: 0.86 }. */
  toEur: Record<string, number>;
}

export interface LandedCost {
  productCost: number; // EUR
  shippingCost: number; // EUR
  total: number; // EUR
  /** Algum valor foi extrapolado ou assumido. */
  estimated: boolean;
  /** Linhas sem tarifa para o país (ex: Países Baixos). Não entram no total. */
  missing: OrderLine[];
  notes: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Priced {
  productCost: number;
  shippingCost: number;
  estimated: boolean;
  note?: string;
}

/** Custo de `quantity` unidades de um produto num só envio, na moeda do produto. */
export function priceShipment(
  rates: SupplierRate[],
  productKey: string,
  country: string,
  quantity: number,
): Priced | null {
  const table = rates
    .filter((r) => r.productKey === productKey && r.country === country)
    .sort((a, b) => a.quantity - b.quantity);
  if (table.length === 0 || quantity <= 0) return null;

  const exact = table.find((r) => r.quantity === quantity);
  if (exact) {
    return { productCost: exact.productCost, shippingCost: exact.shippingCost, estimated: false };
  }

  const last = table[table.length - 1];
  const unitCost = last.productCost / last.quantity;
  const extra = quantity - last.quantity;

  if (table.length >= 2) {
    // O envio cresce de forma ~linear com as unidades (ex: BE +3,76 € / +3,77 €),
    // por isso extrapola com o último incremento conhecido.
    const prev = table[table.length - 2];
    const step = (last.shippingCost - prev.shippingCost) / (last.quantity - prev.quantity);
    return {
      productCost: unitCost * quantity,
      shippingCost: last.shippingCost + step * extra,
      estimated: true,
      note: `${productKey} ×${quantity} (${country}): envio extrapolado a partir de ×${last.quantity}`,
    };
  }

  // Só há tarifa para 1 unidade: sem base para extrapolar, assume o pior caso
  // (envio cobrado por unidade) para nunca sobrestimar o lucro.
  return {
    productCost: unitCost * quantity,
    shippingCost: last.shippingCost * (quantity / last.quantity),
    estimated: true,
    note: `${productKey} ×${quantity} (${country}): sem tarifa para várias unidades, assumido envio por unidade`,
  };
}

export function landedCost(
  ctx: CostContext,
  country: string,
  lines: OrderLine[],
  mode: ShippingMode,
): LandedCost {
  const result: LandedCost = {
    productCost: 0,
    shippingCost: 0,
    total: 0,
    estimated: false,
    missing: [],
    notes: [],
  };

  // Agrupa por produto (a mesma variante pode vir em várias linhas).
  const qtyByProduct = new Map<string, number>();
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    qtyByProduct.set(line.productKey, (qtyByProduct.get(line.productKey) ?? 0) + line.quantity);
  }

  const fx = (currency: string) => {
    const rate = ctx.toEur[currency];
    if (rate === undefined) throw new Error(`Sem taxa de câmbio para ${currency}`);
    return rate;
  };
  const productOf = (key: string) => ctx.products.find((p) => p.key === key);

  const add = (key: string, priced: Priced) => {
    const m = fx(productOf(key)?.currency ?? "EUR");
    result.productCost += priced.productCost * m;
    result.shippingCost += priced.shippingCost * m;
    if (priced.estimated) result.estimated = true;
    if (priced.note) result.notes.push(priced.note);
  };

  const primaryQty = qtyByProduct.get(ctx.primaryProductKey) ?? 0;
  const primaryPriced =
    primaryQty > 0 ? priceShipment(ctx.rates, ctx.primaryProductKey, country, primaryQty) : null;
  const bundling = mode === "together" && primaryPriced !== null;

  for (const [key, quantity] of qtyByProduct) {
    if (key === ctx.primaryProductKey) {
      if (primaryPriced) add(key, primaryPriced);
      else result.missing.push({ productKey: key, quantity });
      continue;
    }

    const own = priceShipment(ctx.rates, key, country, quantity);
    if (!bundling) {
      if (own) add(key, own);
      else result.missing.push({ productKey: key, quantity });
      continue;
    }

    // Vai no pacote do produto principal: paga o produto + envio extra (se cotado).
    const product = productOf(key);
    const unitCost = own ? own.productCost / quantity : null;
    if (unitCost === null) {
      result.missing.push({ productKey: key, quantity });
      continue;
    }
    const extra = product?.bundledExtraShipping;
    add(key, {
      productCost: unitCost * quantity,
      shippingCost: (extra ?? 0) * quantity,
      estimated: extra == null,
      note:
        extra == null
          ? `${key}: envio extra no pacote conjunto ainda sem cotação (assumido 0)`
          : undefined,
    });
  }

  result.productCost = round2(result.productCost);
  result.shippingCost = round2(result.shippingCost);
  result.total = round2(result.productCost + result.shippingCost);
  return result;
}

/** Os dois cenários lado a lado (para a opção "e se fossem separados?"). */
export function compareShippingModes(ctx: CostContext, country: string, lines: OrderLine[]) {
  const together = landedCost(ctx, country, lines, "together");
  const separate = landedCost(ctx, country, lines, "separate");
  return { together, separate, difference: round2(separate.total - together.total) };
}

/** Receita líquida de IVA (preço da Shopify é com IVA incluído). */
export function netOfVat(grossPrice: number, vatRatePercent: number): number {
  return round2(grossPrice / (1 + vatRatePercent / 100));
}
