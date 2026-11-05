import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateJournalStats,
  calculatePositionPlan,
  calculateProfitFactor,
  calculateRMultiple,
  calculateRiskReward,
  calculateTradePnl,
} from "../lib/calculations/risk.ts";
import {
  aggregateDailyPnl,
  calculateBreakEvenRoas,
  calculateGatewayFee,
  calculateOrderProfit,
  computeOrderEconomics,
  summarizePnl,
} from "../lib/calculations/unit-economics.ts";

test("taxa gateway Stripe = 1.5% + 0.25", () => {
  assert.equal(calculateGatewayFee(100), 1.75);
  assert.equal(calculateGatewayFee(0), 0);
});

test("lucro por encomenda", () => {
  assert.equal(calculateOrderProfit({ salePrice: 39.9, cogs: 8, shipping: 4, gatewayFee: 0.85 }), 27.05);
});

test("computeOrderEconomics cruza SKUs e quantidades", () => {
  const costs = new Map([["A", { cogs: 5, shipping_cost: 2 }]]);
  const r = computeOrderEconomics({ salePrice: 50, gateway: "stripe", lineItems: [{ sku: "A", quantity: 2 }, { sku: "X", quantity: 1 }], costsBySku: costs });
  assert.equal(r.totalCogs, 10);
  assert.equal(r.totalShipping, 4);
  assert.equal(r.gatewayFee, 1);
  assert.equal(r.netProfit, 35);
  assert.deepEqual(r.unmatchedSkus, ["X"]);
});

test("Break-Even ROAS", () => {
  assert.equal(calculateBreakEvenRoas(1000, 600), 2.5);
  assert.equal(calculateBreakEvenRoas(1000, 1000), null);
});

test("P&L diário subtrai ad spend e ignora refunded", () => {
  const daily = aggregateDailyPnl({
    orders: [
      { created_at: "2026-01-02T12:00:00Z", total_price: 100, gateway_fee: 1.75, total_cogs: 30, total_shipping: 10, net_profit: 58.25, status_financial: "paid" },
      { created_at: "2026-01-02T13:00:00Z", total_price: 100, gateway_fee: 1.75, total_cogs: 30, total_shipping: 10, net_profit: 58.25, status_financial: "refunded" },
    ],
    adSpend: [{ date: "2026-01-02", amount: 20 }],
    from: "2026-01-01",
    to: "2026-01-03",
    timeZone: "UTC",
  });
  assert.equal(daily.length, 3);
  assert.equal(daily[1]?.netProfit, 38.25);
  assert.equal(daily[1]?.roas, 5);
  assert.equal(summarizePnl(daily).orders, 1);
});

test("posição LONG e SHORT por risco", () => {
  const long = calculatePositionPlan({ direction: "LONG", balance: 10000, maxRiskPercent: 1, entryPrice: 100, stopLoss: 98, takeProfit: 106 });
  assert.ok(long.ok);
  if (long.ok) {
    assert.equal(long.value.riskAmount, 100);
    assert.equal(long.value.positionSize, 50);
    assert.equal(long.value.riskReward, 3);
  }
  const short = calculatePositionPlan({ direction: "SHORT", balance: 10000, maxRiskPercent: 2, entryPrice: 100, stopLoss: 104, takeProfit: 92 });
  assert.ok(short.ok);
  if (short.ok) assert.equal(short.value.positionSize, 50);
  const bad = calculatePositionPlan({ direction: "LONG", balance: 10000, maxRiskPercent: 1, entryPrice: 100, stopLoss: 101, takeProfit: 110 });
  assert.equal(bad.ok, false);
});

test("R:R, P&L, R múltiplo e Profit Factor", () => {
  assert.equal(calculateRiskReward(100, 95, 115), 3);
  assert.equal(calculateTradePnl("SHORT", 100, 90, 2), 20);
  assert.equal(calculateRMultiple({ direction: "LONG", entryPrice: 100, stopLoss: 95, exitPrice: 110, positionSize: 1 }), 2);
  assert.equal(calculateProfitFactor([100, -50, 50]), 3);
  assert.equal(calculateProfitFactor([10]), Number.POSITIVE_INFINITY);
  const stats = calculateJournalStats([
    { status: "CLOSED", net_pnl: 100, r_multiple: 2, closed_at: "2026-01-01" },
    { status: "CLOSED", net_pnl: -50, r_multiple: -1, closed_at: "2026-01-02" },
    { status: "OPEN", net_pnl: null, r_multiple: null, closed_at: null },
  ]);
  assert.equal(stats.closedTrades, 2);
  assert.equal(stats.winRate, 50);
  assert.equal(stats.profitFactor, 2);
  assert.equal(stats.maxDrawdown, 50);
});

test("engine: unit economics e break-even diário", async () => {
  const { calculateUnitEconomics, calculateDailyBreakEven } = await import("../lib/calculations/engine.ts");
  const u = calculateUnitEconomics(100, 30, 10, 0.25, 0.015);
  assert.equal(u.gatewayFee, 1.75);
  assert.equal(u.netProfit, 58.25);
  assert.equal(u.marginPct, 58.25);
  const d = calculateDailyBreakEven(1000, 300, 100, 20, 200);
  assert.equal(d.dailyProfit, 380);
  assert.equal(d.breakEvenRoas, 1.72);
  assert.equal(d.currentRoas, 5);
});

test("engine: fadiga de criativos", async () => {
  const { calculateAdFatigue } = await import("../lib/calculations/engine.ts");
  const healthy = calculateAdFatigue({ impressions: 10000, videoPlays3s: 3000, thruplays: 600, frequency: 1.4, ctr: 1.8, cpa: 12, breakEvenCpa: 20 });
  assert.equal(healthy.hookRate, 30);
  assert.equal(healthy.holdRate, 20);
  assert.equal(healthy.isFatigued, false);
  assert.equal(calculateAdFatigue({ impressions: 1, videoPlays3s: 0, thruplays: 0, frequency: 2.2, ctr: 2, cpa: 1, breakEvenCpa: 5 }).isFatigued, true);
  const lowCtr = calculateAdFatigue({ impressions: 0, videoPlays3s: 0, thruplays: 0, frequency: 1, ctr: 0.8, cpa: 25, breakEvenCpa: 20 });
  assert.equal(lowCtr.isFatigued, true);
  assert.equal(lowCtr.hookRate, null);
});

test("engine: posição, circuit breaker e war chest", async () => {
  const { calculatePositionSize, checkTradingCircuitBreaker, calculateWarChestAllocation } = await import("../lib/calculations/engine.ts");
  const p = calculatePositionSize(10000, 1, 100, 102, "SHORT");
  assert.equal(p.valid, true);
  assert.equal(p.units, 50);
  assert.equal(calculatePositionSize(10000, 1, 100, 102, "LONG").valid, false);
  const cb = checkTradingCircuitBreaker(300, 10000, 3, new Date("2026-03-01T15:00:00Z"));
  assert.equal(cb.isLocked, true);
  assert.equal(cb.unlocksAt, "2026-03-02T00:00:00.000Z");
  assert.equal(checkTradingCircuitBreaker(299.99, 10000, 3).isLocked, false);
  const w = calculateWarChestAllocation(333.33, { reinvestPct: 50, emergencyPct: 30, tradingPct: 20 });
  assert.equal(w.emergency, 100);
  assert.equal(w.trading, 66.67);
  assert.equal(w.reinvest, 166.66);
  assert.equal(calculateWarChestAllocation(100, { reinvestPct: 50, emergencyPct: 30, tradingPct: 10 }).valid, false);
  assert.equal(calculateWarChestAllocation(-50, { reinvestPct: 50, emergencyPct: 30, tradingPct: 20 }).distributable, 0);
});

test("parser CSV Meta Ads (EN com aspas e PT com ;)", async () => {
  const { parseMetaAdsCsv, parseLocaleNumber } = await import("../lib/meta-csv.ts");
  const en = [
    "﻿Reporting starts,Campaign name,Ad name,Amount spent (EUR),Impressions,3-second video plays,ThruPlays,Frequency,CTR (link click-through rate),Cost per result",
    '2026-03-01,Prospecting,"Hook A, UGC",120.50,"10,000",3000,600,1.40,1.85,12.05',
    ",,,,,,,,,",
    "2026-03-01,Prospecting,,500,40000,0,0,2,1,0",
  ].join("\n");
  const r = parseMetaAdsCsv(en);
  assert.deepEqual(r.missingRequired, []);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0]?.adName, "Hook A, UGC");
  assert.equal(r.rows[0]?.impressions, 10000);
  assert.equal(r.rows[0]?.date, "2026-03-01");
  const pt = "Nome da campanha;Nome do anúncio;Valor gasto (EUR);Impressões;Frequência;CTR (taxa de cliques no link);Custo por resultado\nC1;Ad 1;1.234,56;5000;2,30;0,8;25,40";
  const p = parseMetaAdsCsv(pt);
  assert.equal(p.rows[0]?.spend, 1234.56);
  assert.equal(p.rows[0]?.frequency, 2.3);
  assert.equal(p.rows[0]?.ctr, 0.8);
  assert.ok(p.missingOptional.includes("videoPlays3s"));
  assert.equal(parseLocaleNumber("€ 3,20"), 3.2);
  assert.equal(parseMetaAdsCsv("foo,bar\n1,2").missingRequired.length, 4);
});

test("portes por escalão e soma de variantes do mesmo produto", async () => {
  const { calculateTieredShipping, computeOrderEconomics } = await import("../lib/calculations/unit-economics.ts");
  const tiers = { shipping_cost: 4, shipping_cost_2: 6, shipping_cost_3: 7.5 };
  assert.equal(calculateTieredShipping(1, tiers), 4);
  assert.equal(calculateTieredShipping(2, tiers), 6);
  assert.equal(calculateTieredShipping(3, tiers), 7.5);
  assert.equal(calculateTieredShipping(5, tiers), 10.5);
  assert.equal(calculateTieredShipping(3, { shipping_cost: 3, shipping_cost_2: null, shipping_cost_3: null }), 9);
  const costs = new Map([
    ["T-LIGHT", { cogs: 5, ...tiers, product: "Tights" }],
    ["T-TAN", { cogs: 5, ...tiers, product: "Tights" }],
    ["SOCKS", { cogs: 2, shipping_cost: 3, shipping_cost_2: null, shipping_cost_3: null, product: "Socks" }],
  ]);
  const r = computeOrderEconomics({
    salePrice: 77,
    gateway: "manual",
    lineItems: [{ sku: "T-LIGHT", quantity: 1 }, { sku: "T-TAN", quantity: 1 }, { sku: "SOCKS", quantity: 1 }],
    costsBySku: costs,
  });
  assert.equal(r.totalCogs, 12);
  assert.equal(r.totalShipping, 9);
  assert.equal(r.netProfit, 56);
});

test("Winner Score de criativos Meta", async () => {
  const { calculateAdWinnerScore } = await import("../lib/calculations/ad-scoring.ts");
  const now = new Date("2026-03-31T12:00:00Z");
  const fresh = calculateAdWinnerScore({ firstActiveDate: "2026-03-31", activeCopiesCount: 1 }, now);
  assert.equal(fresh.daysActive, 1);
  assert.equal(fresh.winnerScore, 8);
  assert.equal(fresh.tier, "NOVO");
  const testing = calculateAdWinnerScore({ firstActiveDate: "2026-03-28", activeCopiesCount: 1 }, now);
  assert.equal(testing.daysActive, 4);
  assert.equal(testing.tier, "TESTE");
  const stable = calculateAdWinnerScore({ firstActiveDate: "2026-03-21", activeCopiesCount: 2 }, now);
  assert.equal(stable.winnerScore, 38);
  assert.equal(stable.tier, "ESTAVEL");
  const stableScaling = calculateAdWinnerScore({ firstActiveDate: "2026-03-15", activeCopiesCount: 3 }, now);
  assert.equal(stableScaling.daysActive, 17);
  assert.equal(stableScaling.winnerScore, 58);
  assert.equal(stableScaling.isScaling, true);
  assert.equal(stableScaling.tier, "ESTAVEL");
  const probable = calculateAdWinnerScore({ firstActiveDate: "2026-03-15", activeCopiesCount: 5 }, now);
  assert.equal(probable.winnerScore, 68);
  assert.equal(probable.tier, "WINNER_PROVAVEL");
  const winner = calculateAdWinnerScore({ firstActiveDate: "2026-02-01", activeCopiesCount: 12 }, now);
  assert.equal(winner.winnerScore, 100);
  assert.equal(winner.tier, "WINNER_ESCALA");
});

test("tesouraria: cascata P&L, ciclo de caixa, cofre fiscal e cenários", async () => {
  const { calculatePnlCascade, calculateCashCycle, calculateTaxVault, simulateScenario } = await import("../lib/calculations/treasury.ts");
  const p = calculatePnlCascade({ grossRevenue: 12300, refundsAndDiscounts: 0, cogs: 2000, shipping: 1000, gatewayFees: 300, platformFees: 0, adSpend: 4000, fixedCosts: 200, vatPercent: 23, incomeTaxPercent: 20 });
  assert.equal(p.netRevenue, 12300);
  assert.equal(p.contributionMargin, 5000);
  assert.equal(p.ebitda, 4800);
  assert.equal(p.vatReserve, 2300);
  assert.equal(p.incomeTaxProvision, 500);
  assert.equal(p.netCashProfit, 2000);
  const c = calculateCashCycle({ dailyRevenue: 1000, dailyAdSpend: 400, dailySupplierCost: 300, gatewayPayoutDays: 5, supplierPaymentDays: 0, adBillingDays: 1, rollingReservePercent: 10, rollingReserveDays: 90 });
  assert.equal(c.workingCapitalNeeded, 3100);
  assert.equal(c.rollingReserveHeld, 9000);
  assert.equal(c.recommendedCushion, 6000);
  assert.equal(c.totalLiquidityRequired, 12100);
  const v = calculateTaxVault({ revenue: 1230, netProfit: 500, vatPercent: 23, incomeTaxPercent: 20, rollingReservePercent: 10 });
  assert.equal(v.vatReserved, 230);
  assert.equal(v.incomeTaxReserved, 54);
  assert.equal(v.rollingReserve, 123);
  assert.equal(v.availableToSpend, 93);
  const s = simulateScenario({ aov: 40, cogsPerOrder: 8, shippingPerOrder: 4, shippingDelta: 1, gatewayPercent: 1.5, gatewayFixed: 0.25, cpa: 15, returnRatePercent: 5, ordersPerMonth: 100, fixedCostsMonthly: 100 });
  assert.equal(s.breakEvenCpa, 24.15);
  assert.equal(s.profitPerOrder, 9.15);
  assert.equal(s.monthlyNetProfit, 815);
  assert.equal(s.breakEvenRoas, 1.66);
  assert.equal(s.breakEvenOrders, 11);
});

test("assinatura HMAC da Binance (exemplo da documentação)", async () => {
  const { signBinanceQuery, floorToStep, toBinanceDecimal } = await import("../lib/trading/binance-signer.ts");
  const secret = "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j";
  const query = "symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559";
  assert.equal(signBinanceQuery(query, secret), "c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71");
  assert.equal(floorToStep(0.123456, 0.001), 0.123);
  assert.equal(floorToStep(1.9999, 0.01), 1.99);
  assert.equal(toBinanceDecimal(0.0000001), "0.0000001");
});

test("Academia: 14 áreas, 3 níveis cada, conteúdo completo e chaves válidas", async () => {
  const { ACADEMY, masteryKey } = await import("../lib/knowledge/academy.ts");
  assert.equal(ACADEMY.length, 14);
  const ids = new Set<string>();
  for (const area of ACADEMY) {
    assert.ok(!ids.has(area.id), `id repetido: ${area.id}`);
    ids.add(area.id);
    assert.deepEqual(area.levels.map((l) => l.id), ["amador", "pro", "goat"]);
    for (const level of area.levels) {
      assert.ok(level.principles.length >= 3, `${area.id}/${level.id}: poucos princípios`);
      assert.ok(level.actions.length >= 1 && level.metrics.length >= 1 && level.sources.length >= 1, `${area.id}/${level.id}: secção vazia`);
      assert.match(masteryKey(area.id, level.id), /^[a-z_]{2,40}$/);
    }
  }
});
