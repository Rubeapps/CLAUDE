import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  compareShippingModes,
  landedCost,
  netOfVat,
  priceShipment,
  type CostContext,
  type SupplierRate,
} from "./landed-cost.ts";

const rates: SupplierRate[] = [
  { productKey: "principal", country: "BE", quantity: 1, productCost: 4.45, shippingCost: 11.73, currency: "EUR" },
  { productKey: "principal", country: "BE", quantity: 2, productCost: 8.9, shippingCost: 15.49, currency: "EUR" },
  { productKey: "principal", country: "BE", quantity: 3, productCost: 13.35, shippingCost: 19.26, currency: "EUR" },
  { productKey: "meias", country: "BE", quantity: 1, productCost: 0.74, shippingCost: 9.54, currency: "USD" },
];

const ctx: CostContext = {
  rates,
  products: [
    { key: "principal", currency: "EUR", bundledExtraShipping: null },
    { key: "meias", currency: "USD", bundledExtraShipping: null },
  ],
  primaryProductKey: "principal",
  toEur: { EUR: 1, USD: 0.5 }, // taxa fictícia para contas fáceis
};

test("quantidade com tarifa exata não é estimativa", () => {
  const c = landedCost(ctx, "BE", [{ productKey: "principal", quantity: 2 }], "together");
  assert.equal(c.total, 24.39);
  assert.equal(c.estimated, false);
});

test("4+ unidades extrapola o envio com o último incremento", () => {
  const p = priceShipment(rates, "principal", "BE", 4)!;
  assert.equal(Math.round(p.productCost * 100) / 100, 17.8);
  assert.equal(Math.round(p.shippingCost * 100) / 100, 23.03); // 19.26 + 3.77
  assert.equal(p.estimated, true);
});

test("juntos: meias pagam só o produto (+ envio extra cotado)", () => {
  const lines = [
    { productKey: "principal", quantity: 1 },
    { productKey: "meias", quantity: 1 },
  ];
  const together = landedCost(ctx, "BE", lines, "together");
  assert.equal(together.total, 16.55); // 16.18 + 0.74 $ × 0.5
  assert.equal(together.estimated, true); // envio extra sem cotação

  const quoted = landedCost(
    { ...ctx, products: [ctx.products[0], { key: "meias", currency: "USD", bundledExtraShipping: 2 }] },
    "BE",
    lines,
    "together",
  );
  assert.equal(quoted.total, 17.55);
  assert.equal(quoted.estimated, false);
});

test("separados: cada produto paga o seu envio; diferença entre cenários", () => {
  const { together, separate, difference } = compareShippingModes(ctx, "BE", [
    { productKey: "principal", quantity: 1 },
    { productKey: "meias", quantity: 1 },
  ]);
  assert.equal(separate.total, 21.32); // 16.18 + 10.28 $ × 0.5
  assert.equal(difference, round(separate.total - together.total));
});

test("só meias: usa a tabela das meias mesmo em modo 'together'", () => {
  const c = landedCost(ctx, "BE", [{ productKey: "meias", quantity: 1 }], "together");
  assert.equal(c.total, 5.14);
});

test("país sem tarifa fica em 'missing' e fora do total", () => {
  const c = landedCost(ctx, "NL", [{ productKey: "principal", quantity: 1 }], "together");
  assert.equal(c.total, 0);
  assert.deepEqual(c.missing, [{ productKey: "principal", quantity: 1 }]);
});

test("IVA: 31 € com 23 % → 25,20 € líquidos", () => {
  assert.equal(netOfVat(31, 23), 25.2);
});

function round(n: number) {
  return Math.round(n * 100) / 100;
}
