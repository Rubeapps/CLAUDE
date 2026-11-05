/**
 * Unit Economics & P&L — Dropshipping (especificação §4.1).
 *
 *   Taxa_Gateway  = Preço_Venda × percent + fixed            (ex.: Stripe 1.5% + 0.25)
 *   Lucro         = Preço_Venda − (COGS + Portes + Taxa_Gateway)
 *   BE_ROAS       = Faturação_Total / (Faturação_Total − Custos_Totais_Sem_Ads)
 *   Net_Profit_Dia = Σ(Lucro_Encomendas) − Ad_Spend_Dia
 *
 * Funções puras, sem I/O — usadas pelo webhook, pelas páginas e pelos testes.
 */

export interface GatewayFeeRule {
  /** Fração do preço (0.015 = 1.5%). */
  percent: number;
  /** Valor fixo por transação, na moeda da encomenda. */
  fixed: number;
}

/** Regra da especificação (Stripe): 1.5% + 0.25. */
export const DEFAULT_GATEWAY_FEE: GatewayFeeRule = { percent: 0.015, fixed: 0.25 };

/**
 * Regras por gateway (nome normalizado tal como o Shopify o envia em `payment_gateway_names`).
 * Qualquer gateway desconhecido usa DEFAULT_GATEWAY_FEE; pode ser substituído por transação.
 */
export const GATEWAY_FEE_RULES: Readonly<Record<string, GatewayFeeRule>> = {
  stripe: DEFAULT_GATEWAY_FEE,
  shopify_payments: DEFAULT_GATEWAY_FEE,
  paypal: { percent: 0.0349, fixed: 0.35 },
  klarna: { percent: 0.0299, fixed: 0.35 },
  mollie: { percent: 0.018, fixed: 0.25 },
  manual: { percent: 0, fixed: 0 },
  cash_on_delivery: { percent: 0, fixed: 0 },
  bogus: { percent: 0, fixed: 0 },
};

/** Estados financeiros do Shopify que não geram receita no P&L. */
export const NON_REVENUE_FINANCIAL_STATUSES: ReadonlySet<string> = new Set(["voided", "refunded"]);

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeGatewayName(gateway: string): string {
  return gateway
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function resolveGatewayFeeRule(gateway: string, override?: GatewayFeeRule): GatewayFeeRule {
  if (override) return override;
  return GATEWAY_FEE_RULES[normalizeGatewayName(gateway)] ?? DEFAULT_GATEWAY_FEE;
}

/** Taxa = (Preço_Venda × percent) + fixed. Encomendas de valor 0 não pagam taxa. */
export function calculateGatewayFee(salePrice: number, rule: GatewayFeeRule = DEFAULT_GATEWAY_FEE): number {
  if (!Number.isFinite(salePrice) || salePrice <= 0) return 0;
  return round2(salePrice * rule.percent + rule.fixed);
}

export interface OrderCostInput {
  salePrice: number;
  cogs: number;
  shipping: number;
  gatewayFee: number;
}

/** Lucro = Preço_Venda − (COGS + Portes + Taxa_Gateway). */
export function calculateOrderProfit({ salePrice, cogs, shipping, gatewayFee }: OrderCostInput): number {
  return round2(salePrice - (cogs + shipping + gatewayFee));
}

export interface ProductCost {
  cogs: number;
  shipping_cost: number;
}

export interface OrderLineItem {
  sku: string | null;
  quantity: number;
}

export interface OrderEconomics {
  totalCogs: number;
  totalShipping: number;
  gatewayFee: number;
  netProfit: number;
  /** SKUs da encomenda sem custo registado em dropship_products (contados a 0). */
  unmatchedSkus: string[];
}

/**
 * Calcula os custos de uma encomenda a partir das linhas e do catálogo de custos por SKU.
 * Portes = shipping_cost do produto × quantidade.
 */
export function computeOrderEconomics(params: {
  salePrice: number;
  gateway: string;
  lineItems: readonly OrderLineItem[];
  costsBySku: ReadonlyMap<string, ProductCost>;
  feeOverride?: GatewayFeeRule;
}): OrderEconomics {
  let totalCogs = 0;
  let totalShipping = 0;
  const unmatched = new Set<string>();

  for (const item of params.lineItems) {
    const quantity = Math.max(0, Math.trunc(item.quantity));
    const sku = item.sku?.trim() ?? "";
    const cost = sku.length > 0 ? params.costsBySku.get(sku) : undefined;
    if (!cost) {
      unmatched.add(sku.length > 0 ? sku : "(sem SKU)");
      continue;
    }
    totalCogs += cost.cogs * quantity;
    totalShipping += cost.shipping_cost * quantity;
  }

  const gatewayFee = calculateGatewayFee(params.salePrice, resolveGatewayFeeRule(params.gateway, params.feeOverride));
  totalCogs = round2(totalCogs);
  totalShipping = round2(totalShipping);

  return {
    totalCogs,
    totalShipping,
    gatewayFee,
    netProfit: calculateOrderProfit({ salePrice: params.salePrice, cogs: totalCogs, shipping: totalShipping, gatewayFee }),
    unmatchedSkus: [...unmatched],
  };
}

/**
 * BE_ROAS = Faturação / (Faturação − Custos_Sem_Ads).
 * Devolve null quando a margem antes de ads é ≤ 0 (nenhum ROAS dá break-even).
 */
export function calculateBreakEvenRoas(revenue: number, costsWithoutAds: number): number | null {
  const margin = revenue - costsWithoutAds;
  if (revenue <= 0 || margin <= 0) return null;
  return round2(revenue / margin);
}

/** ROAS real = Faturação / Ad_Spend. null sem gasto em ads. */
export function calculateRoas(revenue: number, adSpend: number): number | null {
  if (adSpend <= 0) return null;
  return round2(revenue / adSpend);
}

export interface PnlOrder {
  created_at: string | null;
  total_price: number;
  gateway_fee: number;
  total_cogs: number;
  total_shipping: number;
  net_profit: number;
  status_financial: string;
}

export interface PnlAdSpend {
  date: string;
  amount: number;
}

export interface DailyPnl {
  /** YYYY-MM-DD no fuso horário pedido. */
  date: string;
  orders: number;
  revenue: number;
  cogs: number;
  shipping: number;
  gatewayFees: number;
  /** Σ Lucro_Encomendas (antes de ads). */
  orderProfit: number;
  adSpend: number;
  /** Net_Profit_Dia = Σ Lucro_Encomendas − Ad_Spend_Dia. */
  netProfit: number;
  roas: number | null;
  breakEvenRoas: number | null;
  /** Margem líquida em % da faturação. */
  netMarginPct: number | null;
}

export type PnlSummary = Omit<DailyPnl, "date"> & { days: number; aov: number | null };

/** Converte um timestamp ISO para YYYY-MM-DD num fuso horário IANA. */
export function toDateKey(timestamp: string | Date, timeZone: string): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Lista contínua de datas (inclusive) entre from e to, formato YYYY-MM-DD. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function finalizeDay(date: string, acc: Omit<DailyPnl, "date" | "netProfit" | "roas" | "breakEvenRoas" | "netMarginPct">): DailyPnl {
  const revenue = round2(acc.revenue);
  const costsWithoutAds = acc.cogs + acc.shipping + acc.gatewayFees;
  const netProfit = round2(acc.orderProfit - acc.adSpend);
  return {
    date,
    orders: acc.orders,
    revenue,
    cogs: round2(acc.cogs),
    shipping: round2(acc.shipping),
    gatewayFees: round2(acc.gatewayFees),
    orderProfit: round2(acc.orderProfit),
    adSpend: round2(acc.adSpend),
    netProfit,
    roas: calculateRoas(revenue, acc.adSpend),
    breakEvenRoas: calculateBreakEvenRoas(revenue, costsWithoutAds),
    netMarginPct: revenue > 0 ? round2((netProfit / revenue) * 100) : null,
  };
}

/**
 * Agrega encomendas e ad spend em P&L diário para [from, to].
 * Dias sem atividade aparecem a zero, para gráficos contínuos.
 */
export function aggregateDailyPnl(params: {
  orders: readonly PnlOrder[];
  adSpend: readonly PnlAdSpend[];
  from: string;
  to: string;
  timeZone: string;
}): DailyPnl[] {
  const days = dateRange(params.from, params.to);
  const buckets = new Map(
    days.map((date) => [date, { orders: 0, revenue: 0, cogs: 0, shipping: 0, gatewayFees: 0, orderProfit: 0, adSpend: 0 }]),
  );

  for (const order of params.orders) {
    if (!order.created_at || NON_REVENUE_FINANCIAL_STATUSES.has(order.status_financial)) continue;
    const bucket = buckets.get(toDateKey(order.created_at, params.timeZone));
    if (!bucket) continue;
    bucket.orders += 1;
    bucket.revenue += order.total_price;
    bucket.cogs += order.total_cogs;
    bucket.shipping += order.total_shipping;
    bucket.gatewayFees += order.gateway_fee;
    bucket.orderProfit += order.net_profit;
  }

  for (const spend of params.adSpend) {
    const bucket = buckets.get(spend.date);
    if (bucket) bucket.adSpend += spend.amount;
  }

  return days.map((date) => {
    const bucket = buckets.get(date);
    if (!bucket) throw new Error(`Bucket inexistente para ${date}`);
    return finalizeDay(date, bucket);
  });
}

/** Totais do período (BE_ROAS e ROAS recalculados sobre os totais, não médias). */
export function summarizePnl(daily: readonly DailyPnl[]): PnlSummary {
  const acc = daily.reduce(
    (sum, day) => ({
      orders: sum.orders + day.orders,
      revenue: sum.revenue + day.revenue,
      cogs: sum.cogs + day.cogs,
      shipping: sum.shipping + day.shipping,
      gatewayFees: sum.gatewayFees + day.gatewayFees,
      orderProfit: sum.orderProfit + day.orderProfit,
      adSpend: sum.adSpend + day.adSpend,
    }),
    { orders: 0, revenue: 0, cogs: 0, shipping: 0, gatewayFees: 0, orderProfit: 0, adSpend: 0 },
  );
  const { date: _date, ...totals } = finalizeDay("total", acc);
  return {
    ...totals,
    days: daily.length,
    aov: acc.orders > 0 ? round2(acc.revenue / acc.orders) : null,
  };
}
