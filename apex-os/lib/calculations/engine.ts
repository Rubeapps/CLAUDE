/**
 * Apex OS — Motor de cálculo unificado (funções puras, sem I/O).
 *
 * Reúne as fórmulas de controlo usadas pelo webhook, pelo cron, pelas Server Actions
 * e pelos componentes cliente: unit economics, break-even diário, fadiga de criativos,
 * dimensionamento de posição, circuit breaker de trading e alocação do War Chest.
 */

export type TradeSide = "LONG" | "SHORT";

function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Divisão protegida: devolve null quando o denominador é 0 ou o resultado não é finito. */
function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

/* ─── 1. Unit economics por encomenda ─────────────────────────────────────── */

export interface UnitEconomicsResult {
  /** Taxa da gateway = Preço × gatewayPct + gatewayFixed (0 se o preço for 0). */
  gatewayFee: number;
  /** Custos totais = COGS + Portes + Taxa. */
  totalCosts: number;
  /** Lucro = Preço − (COGS + Portes + Taxa). */
  netProfit: number;
  /** Margem líquida em % do preço; null se o preço for 0. */
  marginPct: number | null;
  /** Break-even CPA: o máximo que se pode pagar por aquisição sem prejuízo. */
  breakEvenCpa: number;
}

/**
 * @param gatewayPct fração do preço (0.015 = 1.5%). Valores > 1 são interpretados como percentagem (1.5 = 1.5%).
 */
export function calculateUnitEconomics(orderPrice: number, cogs: number, shipping: number, gatewayFixed: number, gatewayPct: number): UnitEconomicsResult {
  const price = safeNumber(orderPrice);
  const pct = gatewayPct > 1 ? gatewayPct / 100 : safeNumber(gatewayPct);
  const gatewayFee = price > 0 ? round(price * pct + safeNumber(gatewayFixed)) : 0;
  const totalCosts = round(safeNumber(cogs) + safeNumber(shipping) + gatewayFee);
  const netProfit = round(price - totalCosts);
  const margin = ratio(netProfit, price);
  return {
    gatewayFee,
    totalCosts,
    netProfit,
    marginPct: margin === null ? null : round(margin * 100),
    breakEvenCpa: Math.max(0, netProfit),
  };
}

/* ─── 2. Break-even diário ────────────────────────────────────────────────── */

export interface DailyBreakEvenResult {
  /** Custos sem ads = COGS + Portes + Taxas. */
  costsWithoutAds: number;
  /** Lucro antes de ads = Faturação − custos sem ads. */
  contributionMargin: number;
  /** Lucro do dia = Faturação − custos sem ads − Ad spend. */
  dailyProfit: number;
  /** BE_ROAS = Faturação / (Faturação − Custos_Sem_Ads). null se a margem antes de ads for ≤ 0. */
  breakEvenRoas: number | null;
  /** ROAS = Faturação / Ad spend. null sem ad spend. */
  currentRoas: number | null;
  /** true quando o ROAS atual cobre o break-even (ou não há ads e o dia é lucrativo). */
  isProfitable: boolean;
  /** Ad spend máximo antes de o dia entrar em prejuízo. */
  maxAdSpendAtBreakEven: number;
}

export function calculateDailyBreakEven(totalRevenue: number, totalCogs: number, totalShipping: number, gatewayFees: number, totalAdSpend: number): DailyBreakEvenResult {
  const revenue = safeNumber(totalRevenue);
  const adSpend = safeNumber(totalAdSpend);
  const costsWithoutAds = round(safeNumber(totalCogs) + safeNumber(totalShipping) + safeNumber(gatewayFees));
  const contributionMargin = round(revenue - costsWithoutAds);
  const dailyProfit = round(contributionMargin - adSpend);

  const beRatio = revenue > 0 && contributionMargin > 0 ? ratio(revenue, contributionMargin) : null;
  const roasRatio = adSpend > 0 ? ratio(revenue, adSpend) : null;

  return {
    costsWithoutAds,
    contributionMargin,
    dailyProfit,
    breakEvenRoas: beRatio === null ? null : round(beRatio),
    currentRoas: roasRatio === null ? null : round(roasRatio),
    isProfitable: dailyProfit > 0,
    maxAdSpendAtBreakEven: Math.max(0, contributionMargin),
  };
}

/* ─── 3. Fadiga de criativos (Meta Ads) ───────────────────────────────────── */

export interface AdFatigueInput {
  impressions: number;
  videoPlays3s: number;
  thruplays: number;
  frequency: number;
  /** CTR em percentagem (1.2 = 1.2%). */
  ctr: number;
  cpa: number;
  breakEvenCpa: number;
}

export type AdFatigueReason = "FREQUENCY" | "CPA_ABOVE_BREAK_EVEN_LOW_CTR";

export interface AdFatigueResult {
  /** Hook rate = (3s plays / impressões) × 100. null sem impressões. */
  hookRate: number | null;
  /** Hold rate = (ThruPlays / 3s plays) × 100. null sem 3s plays. */
  holdRate: number | null;
  /** isFatigued = frequência ≥ 2.2 OU (CPA > break-even CPA E CTR < 1%). */
  isFatigued: boolean;
  reasons: AdFatigueReason[];
}

export const AD_FATIGUE_FREQUENCY_THRESHOLD = 2.2;
export const AD_FATIGUE_MIN_CTR = 1.0;

export function calculateAdFatigue(metrics: AdFatigueInput): AdFatigueResult {
  const hook = metrics.impressions > 0 ? ratio(metrics.videoPlays3s, metrics.impressions) : null;
  const hold = metrics.videoPlays3s > 0 ? ratio(metrics.thruplays, metrics.videoPlays3s) : null;

  const reasons: AdFatigueReason[] = [];
  if (safeNumber(metrics.frequency) >= AD_FATIGUE_FREQUENCY_THRESHOLD) reasons.push("FREQUENCY");
  if (safeNumber(metrics.cpa) > safeNumber(metrics.breakEvenCpa) && safeNumber(metrics.ctr) < AD_FATIGUE_MIN_CTR) reasons.push("CPA_ABOVE_BREAK_EVEN_LOW_CTR");

  return {
    hookRate: hook === null ? null : round(hook * 100),
    holdRate: hold === null ? null : round(hold * 100),
    isFatigued: reasons.length > 0,
    reasons,
  };
}

/* ─── 4. Tamanho de posição ───────────────────────────────────────────────── */

export type PositionSizeResult =
  | {
      valid: true;
      /** Unidades/lotes = Risco monetário / Distância do stop. */
      units: number;
      /** Risco monetário = Saldo × (riskPct / 100). */
      riskAmount: number;
      stopDistance: number;
      notional: number;
    }
  | { valid: false; units: 0; riskAmount: number; stopDistance: number; notional: 0; error: string };

export function calculatePositionSize(balance: number, riskPct: number, entry: number, stopLoss: number, direction: TradeSide): PositionSizeResult {
  const riskAmount = balance > 0 && riskPct > 0 ? round(balance * (riskPct / 100)) : 0;
  const stopDistance = direction === "LONG" ? entry - stopLoss : stopLoss - entry;

  if (!(balance > 0)) return { valid: false, units: 0, riskAmount, stopDistance, notional: 0, error: "Saldo tem de ser maior que zero." };
  if (!(riskPct > 0) || riskPct > 100) return { valid: false, units: 0, riskAmount, stopDistance, notional: 0, error: "Risco tem de estar entre 0 e 100%." };
  if (!(entry > 0) || !(stopLoss > 0)) return { valid: false, units: 0, riskAmount, stopDistance, notional: 0, error: "Preços têm de ser positivos." };
  if (!(stopDistance > 0)) {
    return {
      valid: false,
      units: 0,
      riskAmount,
      stopDistance,
      notional: 0,
      error: direction === "LONG" ? "Num LONG o Stop Loss tem de ficar abaixo da entrada." : "Num SHORT o Stop Loss tem de ficar acima da entrada.",
    };
  }

  const units = round(riskAmount / stopDistance, 8);
  return { valid: true, units, riskAmount, stopDistance: round(stopDistance, 8), notional: round(units * entry) };
}

/* ─── 5. Circuit breaker diário ───────────────────────────────────────────── */

export interface CircuitBreakerResult {
  /** true ⇒ o terminal entra em bloqueio forçado até à próxima sessão. */
  isLocked: boolean;
  /** Perda máxima permitida no dia = Saldo × (maxDailyLossPct / 100). */
  maxDailyLoss: number;
  /** Perda já realizada hoje (valor positivo). */
  dailyLoss: number;
  /** Quanto ainda se pode perder antes do bloqueio (≥ 0). */
  remainingLoss: number;
  /** % do limite diário já consumido (0–100+). */
  usedPct: number;
  /** Início da próxima sessão (00:00 UTC do dia seguinte), ISO 8601. */
  unlocksAt: string;
}

/** Próxima sessão de trading: 00:00 UTC do dia seguinte. */
export function nextSessionStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
}

/** Início da sessão atual (00:00 UTC de hoje). */
export function currentSessionStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

/**
 * @param dailyLoss perda realizada na sessão, como valor positivo (lucros contam 0).
 * @param balance saldo de referência da sessão (idealmente o saldo de abertura do dia).
 */
export function checkTradingCircuitBreaker(dailyLoss: number, balance: number, maxDailyLossPct: number, now: Date = new Date()): CircuitBreakerResult {
  const loss = Math.max(0, safeNumber(dailyLoss));
  const maxDailyLoss = balance > 0 && maxDailyLossPct > 0 ? round(balance * (maxDailyLossPct / 100)) : 0;
  const isLocked = maxDailyLoss > 0 ? loss >= maxDailyLoss : loss > 0;
  const used = maxDailyLoss > 0 ? (loss / maxDailyLoss) * 100 : loss > 0 ? 100 : 0;
  return {
    isLocked,
    maxDailyLoss,
    dailyLoss: round(loss),
    remainingLoss: round(Math.max(0, maxDailyLoss - loss)),
    usedPct: round(used),
    unlocksAt: nextSessionStart(now).toISOString(),
  };
}

/* ─── 6. War Chest — alocação de capital ──────────────────────────────────── */

export interface WarChestSplit {
  reinvestPct: number;
  emergencyPct: number;
  tradingPct: number;
}

export interface WarChestAllocation {
  /** false se as percentagens não somarem 100 (nada é alocado). */
  valid: boolean;
  error?: string;
  /** Lucro efetivamente distribuído (0 se o lucro for ≤ 0). */
  distributable: number;
  reinvest: number;
  emergency: number;
  trading: number;
}

/**
 * Divide o lucro líquido pelos três canais. Os valores são arredondados ao cêntimo e
 * o resto do arredondamento vai para o reinvestimento, para que a soma seja exatamente o lucro.
 */
export function calculateWarChestAllocation(netProfit: number, settings: WarChestSplit): WarChestAllocation {
  const { reinvestPct, emergencyPct, tradingPct } = settings;
  const pcts = [reinvestPct, emergencyPct, tradingPct];
  if (pcts.some((p) => !Number.isFinite(p) || p < 0)) {
    return { valid: false, error: "As percentagens têm de ser números ≥ 0.", distributable: 0, reinvest: 0, emergency: 0, trading: 0 };
  }
  const total = round(reinvestPct + emergencyPct + tradingPct);
  if (total !== 100) {
    return { valid: false, error: `As percentagens somam ${total}% (têm de somar 100%).`, distributable: 0, reinvest: 0, emergency: 0, trading: 0 };
  }

  const distributable = Math.max(0, round(safeNumber(netProfit)));
  const emergency = round(distributable * (emergencyPct / 100));
  const trading = round(distributable * (tradingPct / 100));
  const reinvest = round(distributable - emergency - trading);
  return { valid: true, distributable, reinvest, emergency, trading };
}
