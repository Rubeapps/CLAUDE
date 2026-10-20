import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SupplierRate } from "./landed-cost.ts";
import { computeDashboard, dateRange, type DashboardInput, type NormalizedOrder } from "./metrics.ts";

const PRINCIPAL = "gid://shopify/Product/1";
const MEIAS = "gid://shopify/Product/2";

const rates: SupplierRate[] = [
  { productKey: "principal", country: "ES", quantity: 1, productCost: 4.45, shippingCost: 10.75, currency: "EUR", validFrom: "2026-10-01" },
  { productKey: "principal", country: "ES", quantity: 2, productCost: 8.9, shippingCost: 14.09, currency: "EUR", validFrom: "2026-10-01" },
  { productKey: "meias", country: "ES", quantity: 1, productCost: 0.74, shippingCost: 8.21, currency: "USD", validFrom: "2026-10-01" },
];

function order(partial: Partial<NormalizedOrder>): NormalizedOrder {
  return {
    id: "1",
    name: "#1001",
    date: "2026-10-10",
    country: "ES",
    grossRevenue: 31,
    tax: 0,
    gatewayFees: 1,
    gatewayFeesTax: 0.23,
    lines: [{ shopifyProductId: PRINCIPAL, title: "Principal", quantity: 1 }],
    ...partial,
  };
}

function input(overrides: Partial<DashboardInput> = {}): DashboardInput {
  return {
    from: "2026-10-09",
    to: "2026-10-11",
    orders: [order({})],
    adSpend: [{ date: "2026-10-10", spend: 10 }],
    rates,
    products: [
      { key: "principal", currency: "EUR", bundledExtraShipping: null, shopifyProductIds: [PRINCIPAL] },
      { key: "meias", currency: "USD", bundledExtraShipping: null, shopifyProductIds: [MEIAS] },
    ],
    settings: { vatMode: "exempt", vatRate: 23, shippingMode: "together", primaryProductKey: "principal" },
    toEur: { EUR: 1, USD: 0.5 },
    ...overrides,
  };
}

test("isento: IVA de anúncios e taxas entra como custo", () => {
  const { totals } = computeDashboard(input());
  assert.equal(totals.grossRevenue, 31);
  assert.equal(totals.netRevenue, 31);
  assert.equal(totals.cogs, 4.45);
  assert.equal(totals.shipping, 10.75);
  assert.equal(totals.gatewayFees, 1.23);
  assert.equal(totals.adSpend, 12.3);
  assert.equal(totals.adSpendReported, 10);
  assert.equal(totals.netProfit, 2.27); // 31 − 4,45 − 10,75 − 1,23 − 12,30
  assert.equal(totals.roas, 3.1);
});

test("regime normal: IVA cobrado sai da receita, IVA de custos é dedutível", () => {
  const { totals } = computeDashboard(
    input({
      orders: [order({ tax: 5.8 })],
      settings: { vatMode: "pt_standard", vatRate: 23, shippingMode: "together", primaryProductKey: "principal" },
    }),
  );
  assert.equal(totals.netRevenue, 25.2);
  assert.equal(totals.adSpend, 10);
  assert.equal(totals.gatewayFees, 1);
  assert.equal(totals.netProfit, -1); // 25,20 − 4,45 − 10,75 − 1 − 10
});

test("ROAS de break-even anula o lucro", () => {
  const { totals } = computeDashboard(input());
  const contribution = 31 - 4.45 - 10.75 - 1.23;
  // Com ROAS = break-even, ads = 31 / BE; custo = ads × 1,23 = contribuição
  assert.ok(Math.abs((31 / totals.breakEvenRoas!) * 1.23 - contribution) < 1e-9);
});

test("série diária cobre todos os dias, mesmo sem vendas", () => {
  const { daily } = computeDashboard(input());
  assert.deepEqual(daily.map((d) => d.date), ["2026-10-09", "2026-10-10", "2026-10-11"]);
  assert.equal(daily[0].revenue, 0);
  assert.equal(daily[1].profit, 2.27);
});

test("cenário alternativo (separado) e aviso de estimativa nas meias", () => {
  const result = computeDashboard(
    input({
      orders: [
        order({
          lines: [
            { shopifyProductId: PRINCIPAL, title: "Principal", quantity: 1 },
            { shopifyProductId: MEIAS, title: "Meias", quantity: 1 },
          ],
        }),
      ],
    }),
  );
  assert.equal(result.totals.cogs + result.totals.shipping, 15.57); // 15,20 + 0,74 $ × 0,5
  assert.equal(result.alternative.mode, "separate");
  assert.equal(result.alternative.difference, 4.11); // envio das meias à parte: 8,21 $ × 0,5
  assert.equal(result.estimatedOrders, 1);
});

test("produtos sem correspondência e encomendas fora do período", () => {
  const result = computeDashboard(
    input({
      orders: [
        order({ lines: [{ shopifyProductId: "gid://shopify/Product/9", title: "Gift card", quantity: 1 }] }),
        order({ date: "2026-09-01" }),
      ],
    }),
  );
  assert.equal(result.totals.orders, 1);
  assert.deepEqual(result.unmappedProducts, ["Gift card"]);
  assert.equal(result.issues.length, 1);
});

test("tarifas usam a versão em vigor na data da encomenda", () => {
  const result = computeDashboard(
    input({
      rates: [
        ...rates,
        { productKey: "principal", country: "ES", quantity: 1, productCost: 4.45, shippingCost: 20, currency: "EUR", validFrom: "2026-10-11" },
      ],
    }),
  );
  assert.equal(result.totals.shipping, 10.75);
});

test("dateRange atravessa a mudança de hora", () => {
  assert.equal(dateRange("2026-10-20", "2026-10-30").length, 11);
});
