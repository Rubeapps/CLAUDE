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
