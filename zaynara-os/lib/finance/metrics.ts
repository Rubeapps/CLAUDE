// Métricas do Dashboard. Lógica 100 % determinística: recebe dados já
// normalizados (Shopify, Meta, tabela do fornecedor) e devolve números.

import {
  landedCost,
  ratesAt,
  type CostProduct,
  type ShippingMode,
  type SupplierRate,
} from "./landed-cost.ts";

export type VatMode = "pt_standard" | "exempt" | "oss";

export interface OrderLineInput {
  shopifyProductId: string | null;
  title: string;
  quantity: number;
}

export interface NormalizedOrder {
  id: string;
  name: string; // ex: "#1042"
  date: string; // YYYY-MM-DD no fuso do negócio
  country: string | null;
  grossRevenue: number; // EUR, total atual (após devoluções), com IVA e portes cobrados
  tax: number; // IVA cobrado ao cliente
  gatewayFees: number; // sem IVA
  gatewayFeesTax: number; // IVA sobre as taxas
  lines: OrderLineInput[];
}

export interface DailyAdSpend {
  date: string;
  spend: number; // EUR, sem IVA (como o Meta reporta)
}

export interface BusinessSettings {
  vatMode: VatMode;
  vatRate: number; // %
  shippingMode: ShippingMode;
  primaryProductKey: string;
}

export interface CostProductWithMapping extends CostProduct {
  shopifyProductIds: string[];
}

export interface DashboardInput {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
  orders: NormalizedOrder[];
  adSpend: DailyAdSpend[];
  rates: SupplierRate[];
  products: CostProductWithMapping[];
  settings: BusinessSettings;
  toEur: Record<string, number>;
}

export interface Totals {
  orders: number;
  grossRevenue: number;
  vatCollected: number;
  netRevenue: number;
  cogs: number;
  shipping: number;
  gatewayFees: number;
  adSpend: number; // custo real (inclui IVA não dedutível quando isento)
  adSpendReported: number; // valor do Meta
  netProfit: number;
  netMargin: number | null; // lucro / receita líquida
  roas: number | null; // receita bruta / gasto reportado
  breakEvenRoas: number | null;
}

export interface DailyPoint {
  date: string;
  revenue: number;
  profit: number;
}

export interface OrderIssue {
  order: string;
  reason: string;
}

export interface DashboardResult {
  totals: Totals;
  daily: DailyPoint[];
  /** Mesmo período, se o envio fosse no outro modo (junto ↔ separado). */
  alternative: { mode: ShippingMode; cogsPlusShipping: number; difference: number };
  estimatedOrders: number;
  estimateNotes: string[];
  issues: OrderIssue[];
  unmappedProducts: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Todas as datas YYYY-MM-DD entre from e to (inclusive). */
export function dateRange(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function computeDashboard(input: DashboardInput): DashboardResult {
  const { settings } = input;
  const vatFactor = 1 + settings.vatRate / 100;
  // Isento (art. 53.º): o IVA pago em anúncios e taxas não é dedutível → é custo.
  const vatIsCost = settings.vatMode === "exempt";
  const altMode: ShippingMode = settings.shippingMode === "together" ? "separate" : "together";

  const productKeyById = new Map<string, string>();
  for (const p of input.products) for (const id of p.shopifyProductIds) productKeyById.set(id, p.key);

  const days = dateRange(input.from, input.to);
  const byDay = new Map(days.map((d) => [d, { revenue: 0, profit: 0 }]));

  const t = {
    orders: 0,
    grossRevenue: 0,
    vatCollected: 0,
    cogs: 0,
    shipping: 0,
    gatewayFees: 0,
    adSpend: 0,
    adSpendReported: 0,
  };
  let altCosts = 0;
  let estimatedOrders = 0;
  const estimateNotes = new Set<string>();
  const issues: OrderIssue[] = [];
  const unmapped = new Set<string>();

  for (const order of input.orders) {
    const day = byDay.get(order.date);
    if (!day) continue;

    const fees = order.gatewayFees + (vatIsCost ? order.gatewayFeesTax : 0);

    const lines = [];
    for (const line of order.lines) {
      const key = line.shopifyProductId ? productKeyById.get(line.shopifyProductId) : undefined;
      if (!key) {
        unmapped.add(line.title);
        continue;
      }
      lines.push({ productKey: key, quantity: line.quantity });
    }

    let cogs = 0;
    let shipping = 0;
    if (!order.country) {
      issues.push({ order: order.name, reason: "Sem morada de envio: custo do fornecedor não calculado" });
    } else if (lines.length > 0) {
      const ctx = {
        rates: ratesAt(input.rates, order.date),
        products: input.products,
        primaryProductKey: settings.primaryProductKey,
        toEur: input.toEur,
      };
      const cost = landedCost(ctx, order.country, lines, settings.shippingMode);
      const alt = landedCost(ctx, order.country, lines, altMode);
      cogs = cost.productCost;
      shipping = cost.shippingCost;
      altCosts += alt.total;
      if (cost.estimated) {
        estimatedOrders++;
        for (const note of cost.notes) estimateNotes.add(note.replace(/ \([A-Z]{2}\)/, ""));
      }
      for (const m of cost.missing) {
        issues.push({
          order: order.name,
          reason: `Sem tarifa do fornecedor para ${m.productKey} ×${m.quantity} em ${order.country}`,
        });
      }
    }
    if (order.lines.length > lines.length) {
      issues.push({ order: order.name, reason: "Tem produtos sem correspondência na tabela de custos" });
    }

    const net = order.grossRevenue - order.tax;
    const profit = net - cogs - shipping - fees;

    t.orders++;
    t.grossRevenue += order.grossRevenue;
    t.vatCollected += order.tax;
    t.cogs += cogs;
    t.shipping += shipping;
    t.gatewayFees += fees;
    day.revenue += order.grossRevenue;
    day.profit += profit;
  }

  for (const ad of input.adSpend) {
    const day = byDay.get(ad.date);
    if (!day) continue;
    const cost = ad.spend * (vatIsCost ? vatFactor : 1);
    t.adSpendReported += ad.spend;
    t.adSpend += cost;
    day.profit -= cost;
  }

  const netRevenue = t.grossRevenue - t.vatCollected;
  const netProfit = netRevenue - t.cogs - t.shipping - t.gatewayFees - t.adSpend;
  const variableCosts = t.cogs + t.shipping + t.gatewayFees;
  // ROAS a partir do qual o lucro é zero: receita bruta / ads = 1 / margem de contribuição.
  const contribution = netRevenue - variableCosts;
  const adCostFactor = t.adSpendReported > 0 ? t.adSpend / t.adSpendReported : vatIsCost ? vatFactor : 1;

  return {
    totals: {
      orders: t.orders,
      grossRevenue: r2(t.grossRevenue),
      vatCollected: r2(t.vatCollected),
      netRevenue: r2(netRevenue),
      cogs: r2(t.cogs),
      shipping: r2(t.shipping),
      gatewayFees: r2(t.gatewayFees),
      adSpend: r2(t.adSpend),
      adSpendReported: r2(t.adSpendReported),
      netProfit: r2(netProfit),
      netMargin: netRevenue > 0 ? netProfit / netRevenue : null,
      roas: t.adSpendReported > 0 ? t.grossRevenue / t.adSpendReported : null,
      breakEvenRoas: contribution > 0 ? (t.grossRevenue * adCostFactor) / contribution : null,
    },
    daily: days.map((date) => {
      const d = byDay.get(date)!;
      return { date, revenue: r2(d.revenue), profit: r2(d.profit) };
    }),
    alternative: {
      mode: altMode,
      cogsPlusShipping: r2(altCosts),
      difference: r2(altCosts - (t.cogs + t.shipping)),
    },
    estimatedOrders,
    estimateNotes: [...estimateNotes],
    issues,
    unmappedProducts: [...unmapped],
  };
}
