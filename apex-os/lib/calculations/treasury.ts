/**
 * Tesouraria e fiscalidade de e-commerce (funções puras).
 * Valores indicativos para gestão — não substituem um contabilista certificado.
 */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nonNeg(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/* ─── P&L em cascata ──────────────────────────────────────────────────────── */

export interface PnlCascadeInput {
  /** Faturação bruta paga pelos clientes (IVA incluído). */
  grossRevenue: number;
  /** Descontos e devoluções/reembolsos. */
  refundsAndDiscounts: number;
  cogs: number;
  shipping: number;
  gatewayFees: number;
  /** Taxas de transação da Shopify (se não usas Shopify Payments). */
  platformFees: number;
  adSpend: number;
  /** Custos fixos do período (apps, domínio, ferramentas). */
  fixedCosts: number;
  /** Taxa de IVA incluída nos preços (23 = 23%). */
  vatPercent: number;
  /** Taxa efetiva estimada de IRS/IRC sobre o lucro. */
  incomeTaxPercent: number;
}

export interface PnlCascadeStep {
  key: string;
  label: string;
  /** "+" receita, "-" dedução, "=" subtotal. */
  kind: "+" | "-" | "=";
  value: number;
}

export interface PnlCascadeResult {
  steps: PnlCascadeStep[];
  netRevenue: number;
  grossProfit1: number;
  grossProfit2: number;
  contributionMargin: number;
  ebitda: number;
  vatReserve: number;
  incomeTaxProvision: number;
  netCashProfit: number;
}

/**
 * Faturação bruta → Net Cash Profit.
 * IVA: os preços B2C incluem IVA, logo IVA = Faturação líquida × t / (100 + t).
 * Imposto sobre o rendimento: sobre o EBITDA já sem IVA (só se positivo).
 */
export function calculatePnlCascade(input: PnlCascadeInput): PnlCascadeResult {
  const gross = nonNeg(input.grossRevenue);
  const netRevenue = round2(gross - nonNeg(input.refundsAndDiscounts));
  const grossProfit1 = round2(netRevenue - nonNeg(input.cogs) - nonNeg(input.shipping));
  const grossProfit2 = round2(grossProfit1 - nonNeg(input.gatewayFees) - nonNeg(input.platformFees));
  const contributionMargin = round2(grossProfit2 - nonNeg(input.adSpend));
  const ebitda = round2(contributionMargin - nonNeg(input.fixedCosts));
  const vatReserve = round2(netRevenue > 0 ? (netRevenue * nonNeg(input.vatPercent)) / (100 + nonNeg(input.vatPercent)) : 0);
  const taxable = ebitda - vatReserve;
  const incomeTaxProvision = round2(taxable > 0 ? (taxable * nonNeg(input.incomeTaxPercent)) / 100 : 0);
  const netCashProfit = round2(ebitda - vatReserve - incomeTaxProvision);

  return {
    netRevenue,
    grossProfit1,
    grossProfit2,
    contributionMargin,
    ebitda,
    vatReserve,
    incomeTaxProvision,
    netCashProfit,
    steps: [
      { key: "gross", label: "Faturação bruta", kind: "+", value: round2(gross) },
      { key: "refunds", label: "Descontos e devoluções", kind: "-", value: round2(nonNeg(input.refundsAndDiscounts)) },
      { key: "net", label: "Faturação líquida", kind: "=", value: netRevenue },
      { key: "cogs", label: "COGS (fornecedor)", kind: "-", value: round2(nonNeg(input.cogs)) },
      { key: "shipping", label: "Portes", kind: "-", value: round2(nonNeg(input.shipping)) },
      { key: "gp1", label: "Margem bruta 1", kind: "=", value: grossProfit1 },
      { key: "gateway", label: "Taxas de gateway", kind: "-", value: round2(nonNeg(input.gatewayFees)) },
      { key: "platform", label: "Taxas de transação Shopify", kind: "-", value: round2(nonNeg(input.platformFees)) },
      { key: "gp2", label: "Margem bruta 2", kind: "=", value: grossProfit2 },
      { key: "ads", label: "Tráfego pago (Meta / TikTok / Google)", kind: "-", value: round2(nonNeg(input.adSpend)) },
      { key: "cm3", label: "Margem de contribuição (CM3)", kind: "=", value: contributionMargin },
      { key: "fixed", label: "Custos fixos operacionais", kind: "-", value: round2(nonNeg(input.fixedCosts)) },
      { key: "ebitda", label: "EBITDA operacional", kind: "=", value: ebitda },
      { key: "vat", label: "Reserva de IVA", kind: "-", value: vatReserve },
      { key: "tax", label: "Provisão IRS / IRC", kind: "-", value: incomeTaxProvision },
      { key: "ncp", label: "Net Cash Profit real", kind: "=", value: netCashProfit },
    ],
  };
}

/* ─── Ciclo de conversão de caixa ─────────────────────────────────────────── */

export interface CashCycleInput {
  /** Faturação média diária. */
  dailyRevenue: number;
  dailyAdSpend: number;
  /** COGS + portes médios diários pagos ao fornecedor. */
  dailySupplierCost: number;
  /** Dias até o gateway transferir para o banco (ex.: 3–7). */
  gatewayPayoutDays: number;
  /** Dias até pagares ao fornecedor (0 = pagamento imediato). */
  supplierPaymentDays: number;
  /** Dias entre o gasto em ads e a cobrança no cartão (1–2). */
  adBillingDays: number;
  /** % da faturação retida pelo gateway (rolling reserve). */
  rollingReservePercent: number;
  /** Dias que a reserva fica retida (90–180). */
  rollingReserveDays: number;
}

export interface CashCycleResult {
  /** Dias de desfasamento ads → dinheiro recebido. */
  adGapDays: number;
  supplierGapDays: number;
  /** Capital preso em ads e fornecedor antes de o gateway pagar. */
  workingCapitalNeeded: number;
  /** Dinheiro retido pelo gateway em regime de reserva. */
  rollingReserveHeld: number;
  /** Colchão recomendado = 20% de 30 dias de faturação. */
  recommendedCushion: number;
  /** Total de liquidez a ter disponível. */
  totalLiquidityRequired: number;
}

export function calculateCashCycle(input: CashCycleInput): CashCycleResult {
  const adGapDays = Math.max(0, nonNeg(input.gatewayPayoutDays) - nonNeg(input.adBillingDays));
  const supplierGapDays = Math.max(0, nonNeg(input.gatewayPayoutDays) - nonNeg(input.supplierPaymentDays));
  const workingCapitalNeeded = round2(nonNeg(input.dailyAdSpend) * adGapDays + nonNeg(input.dailySupplierCost) * supplierGapDays);
  const reserveDays = Math.min(nonNeg(input.rollingReserveDays), 365);
  const rollingReserveHeld = round2(nonNeg(input.dailyRevenue) * (nonNeg(input.rollingReservePercent) / 100) * reserveDays);
  const recommendedCushion = round2(nonNeg(input.dailyRevenue) * 30 * 0.2);
  return {
    adGapDays,
    supplierGapDays,
    workingCapitalNeeded,
    rollingReserveHeld,
    recommendedCushion,
    totalLiquidityRequired: round2(Math.max(recommendedCushion, workingCapitalNeeded + rollingReserveHeld)),
  };
}

/* ─── Cofre fiscal ────────────────────────────────────────────────────────── */

export interface TaxVaultInput {
  /** Faturação do período (IVA incluído). */
  revenue: number;
  /** Lucro líquido do período (após ads), ainda com IVA lá dentro. */
  netProfit: number;
  vatPercent: number;
  incomeTaxPercent: number;
  rollingReservePercent: number;
}

export interface TaxVaultResult {
  vatReserved: number;
  incomeTaxReserved: number;
  rollingReserve: number;
  /** Total que não é teu para gastar. */
  totalReserved: number;
  /** Lucro que podes gastar ou reinvestir com segurança. */
  availableToSpend: number;
}

export function calculateTaxVault(input: TaxVaultInput): TaxVaultResult {
  const revenue = nonNeg(input.revenue);
  const vatReserved = round2((revenue * nonNeg(input.vatPercent)) / (100 + nonNeg(input.vatPercent)));
  const profitExVat = input.netProfit - vatReserved;
  const incomeTaxReserved = round2(profitExVat > 0 ? (profitExVat * nonNeg(input.incomeTaxPercent)) / 100 : 0);
  const rollingReserve = round2((revenue * nonNeg(input.rollingReservePercent)) / 100);
  const totalReserved = round2(vatReserved + incomeTaxReserved + rollingReserve);
  return {
    vatReserved,
    incomeTaxReserved,
    rollingReserve,
    totalReserved,
    availableToSpend: round2(input.netProfit - totalReserved),
  };
}

/* ─── Simulador de cenários ───────────────────────────────────────────────── */

export interface ScenarioInput {
  /** Ticket médio (IVA incluído). */
  aov: number;
  cogsPerOrder: number;
  shippingPerOrder: number;
  /** Variação dos portes por encomenda (+1.5 = fornecedor sobe 1,50 €). */
  shippingDelta: number;
  gatewayPercent: number;
  gatewayFixed: number;
  /** Custo por aquisição (ad spend por encomenda). */
  cpa: number;
  /** % de encomendas reembolsadas (perde-se a receita; COGS, portes, taxa e CPA não voltam). */
  returnRatePercent: number;
  ordersPerMonth: number;
  /** Custos fixos mensais. */
  fixedCostsMonthly: number;
}

export interface ScenarioResult {
  /** Receita efetiva por encomenda após devoluções. */
  effectiveRevenuePerOrder: number;
  /** Margem antes de ads por encomenda (o máximo que se pode pagar de CPA). */
  breakEvenCpa: number;
  profitPerOrder: number;
  monthlyNetProfit: number;
  /** BE ROAS = AOV / margem antes de ads. null se não houver margem. */
  breakEvenRoas: number | null;
  /** ROAS atual = AOV / CPA. */
  currentRoas: number | null;
  /** Quanto o CPA pode subir (%) antes do prejuízo. Negativo = já em prejuízo. */
  safetyMarginPercent: number | null;
  /** Encomendas mensais necessárias para cobrir os custos fixos. */
  breakEvenOrders: number | null;
}

export function simulateScenario(input: ScenarioInput): ScenarioResult {
  const aov = nonNeg(input.aov);
  const r = Math.min(100, nonNeg(input.returnRatePercent)) / 100;
  const shipping = Math.max(0, nonNeg(input.shippingPerOrder) + input.shippingDelta);
  const gatewayFee = aov > 0 ? aov * (nonNeg(input.gatewayPercent) / 100) + nonNeg(input.gatewayFixed) : 0;
  const effectiveRevenuePerOrder = round2(aov * (1 - r));
  const breakEvenCpa = round2(effectiveRevenuePerOrder - nonNeg(input.cogsPerOrder) - shipping - gatewayFee);
  const cpa = nonNeg(input.cpa);
  const profitPerOrder = round2(breakEvenCpa - cpa);
  const monthlyNetProfit = round2(profitPerOrder * nonNeg(input.ordersPerMonth) - nonNeg(input.fixedCostsMonthly));
  return {
    effectiveRevenuePerOrder,
    breakEvenCpa,
    profitPerOrder,
    monthlyNetProfit,
    breakEvenRoas: breakEvenCpa > 0 ? round2(aov / breakEvenCpa) : null,
    currentRoas: cpa > 0 ? round2(aov / cpa) : null,
    safetyMarginPercent: cpa > 0 ? round2(((breakEvenCpa - cpa) / cpa) * 100) : null,
    breakEvenOrders: profitPerOrder > 0 ? Math.ceil(nonNeg(input.fixedCostsMonthly) / profitPerOrder) : null,
  };
}
