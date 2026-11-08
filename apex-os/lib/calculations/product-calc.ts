/**
 * Calculadora de produto (funções puras): lucro, CPA máximo, preço recomendado e custo máximo
 * do fornecedor para uma quantidade (1, 2 ou 3 unidades) e um valor de portes.
 */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nonNeg(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export interface ProductCalcInput {
  /** Preço de venda por unidade (o que o cliente paga). */
  unitPrice: number;
  /** Custo do produto ao fornecedor por unidade (COGS). */
  unitCogs: number;
  /** Unidades na encomenda (bundle). */
  quantity: number;
  /** Preço total da encomenda nesta quantidade (pack). Vazio ou 0 ⇒ unitPrice × quantity. */
  orderPrice?: number | null;
  /** Portes totais da encomenda para esta quantidade e país. */
  shipping: number;
  /** Taxa do gateway em % (1.5 = 1.5%). */
  gatewayPercent: number;
  /** Taxa fixa do gateway por encomenda. */
  gatewayFixed: number;
  /** IVA incluído no preço, em % (0 se não cobras IVA). */
  vatPercent: number;
  /** Custo de aquisição esperado por encomenda (0 se ainda não sabes). */
  cpa: number;
  /** Margem líquida desejada sobre a faturação, em %. */
  targetMarginPercent: number;
}

export interface ProductCalcResult {
  /** Faturação bruta da encomenda (IVA incluído). */
  revenue: number;
  vat: number;
  gatewayFee: number;
  cogs: number;
  shipping: number;
  /** Custo total sem anúncios: COGS + portes + gateway + IVA. */
  totalCostBeforeAds: number;
  /** Lucro antes de anúncios = máximo que podes pagar por cliente (break-even CPA). */
  maxCpa: number;
  /** Lucro depois do CPA indicado. */
  profit: number;
  /** Margem líquida % sobre a faturação (depois do CPA). */
  marginPercent: number | null;
  /** ROAS mínimo para não perder dinheiro. */
  breakEvenRoas: number | null;
  /** Preço por unidade para atingir a margem desejada (com o CPA indicado). null se impossível. */
  recommendedUnitPrice: number | null;
  /** Custo máximo por unidade ao fornecedor para atingir a margem desejada ao preço atual. */
  maxUnitCogs: number | null;
  /** CPA máximo que ainda deixa a margem desejada. */
  maxCpaForTargetMargin: number;
}

export function calculateProduct(input: ProductCalcInput): ProductCalcResult {
  const q = Math.max(1, Math.trunc(input.quantity));
  const price = nonNeg(input.unitPrice);
  const orderPrice = nonNeg(input.orderPrice ?? 0);
  const revenue = orderPrice > 0 ? orderPrice : price * q;
  const vatRate = nonNeg(input.vatPercent) / 100;
  const g = nonNeg(input.gatewayPercent) / 100;
  const fixed = revenue > 0 ? nonNeg(input.gatewayFixed) : 0;
  const m = Math.min(95, nonNeg(input.targetMarginPercent)) / 100;
  const vat = revenue - revenue / (1 + vatRate);
  const gatewayFee = revenue * g + fixed;
  const cogs = nonNeg(input.unitCogs) * q;
  const shipping = nonNeg(input.shipping);
  const cpa = nonNeg(input.cpa);

  const totalCostBeforeAds = cogs + shipping + gatewayFee + vat;
  const maxCpa = revenue - totalCostBeforeAds;
  const profit = maxCpa - cpa;

  // Preço P (por unidade) tal que lucro = m × faturação:
  // P·q·(1/(1+v) − g − m) = fixo + COGS + portes + CPA
  const factor = 1 / (1 + vatRate) - g - m;
  const recommendedUnitPrice = factor > 0 ? (nonNeg(input.gatewayFixed) + cogs + shipping + cpa) / (factor * q) : null;

  // COGS máximo por unidade para a margem desejada ao preço atual.
  const maxCogsTotal = revenue / (1 + vatRate) - gatewayFee - shipping - cpa - m * revenue;
  const maxCpaForTargetMargin = revenue / (1 + vatRate) - gatewayFee - shipping - cogs - m * revenue;

  return {
    revenue: round2(revenue),
    vat: round2(vat),
    gatewayFee: round2(gatewayFee),
    cogs: round2(cogs),
    shipping: round2(shipping),
    totalCostBeforeAds: round2(totalCostBeforeAds),
    maxCpa: round2(maxCpa),
    profit: round2(profit),
    marginPercent: revenue > 0 ? round2((profit / revenue) * 100) : null,
    breakEvenRoas: maxCpa > 0 ? round2(revenue / maxCpa) : null,
    recommendedUnitPrice: recommendedUnitPrice === null ? null : round2(recommendedUnitPrice),
    maxUnitCogs: revenue > 0 ? round2(maxCogsTotal / q) : null,
    maxCpaForTargetMargin: round2(maxCpaForTargetMargin),
  };
}
