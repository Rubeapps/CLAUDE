/**
 * Gestão de Risco de Trading (especificação §4.3).
 *
 *   Risco_Val  = Saldo × (max_risk_percent / 100)
 *   Distância  = LONG: Entrada − SL   |   SHORT: SL − Entrada
 *   Posição    = Risco_Val / Distância
 *   R:R        = |TP − Entrada| / |Entrada − SL|
 *   Profit Factor = Σ Ganhos / Σ |Perdas|
 */

export type Direction = "LONG" | "SHORT";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Risco_Val = Saldo × (max_risk_percent / 100). */
export function calculateMaxRiskAmount(balance: number, maxRiskPercent: number): number {
  if (!isPositiveFinite(balance) || !isPositiveFinite(maxRiskPercent)) return 0;
  return roundTo(balance * (maxRiskPercent / 100), 2);
}

/** Distância do stop. Positiva quando o SL está do lado correto da entrada. */
export function calculateStopDistance(direction: Direction, entryPrice: number, stopLoss: number): number {
  return direction === "LONG" ? entryPrice - stopLoss : stopLoss - entryPrice;
}

/** Posição = Risco_Val / Distância (unidades/lotes do ativo). */
export function calculatePositionSize(riskAmount: number, stopDistance: number): number {
  if (!isPositiveFinite(riskAmount) || !isPositiveFinite(stopDistance)) return 0;
  return riskAmount / stopDistance;
}

/** R:R = |TP − Entrada| / |Entrada − SL|. null se o stop estiver na entrada. */
export function calculateRiskReward(entryPrice: number, stopLoss: number, takeProfit: number): number | null {
  const risk = Math.abs(entryPrice - stopLoss);
  if (risk === 0 || !Number.isFinite(risk)) return null;
  return roundTo(Math.abs(takeProfit - entryPrice) / risk, 2);
}

export interface PositionPlanInput {
  direction: Direction;
  balance: number;
  maxRiskPercent: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
}

export interface PositionPlan {
  riskAmount: number;
  stopDistance: number;
  stopDistancePct: number;
  positionSize: number;
  notional: number;
  /** Alavancagem efetiva = notional / saldo. */
  effectiveLeverage: number;
  riskReward: number | null;
  potentialProfit: number;
  potentialLoss: number;
}

/** Valida as regras de direção e devolve o plano completo da posição. */
export function calculatePositionPlan(input: PositionPlanInput): Result<PositionPlan> {
  const { direction, balance, maxRiskPercent, entryPrice, stopLoss, takeProfit } = input;

  if (!isPositiveFinite(balance)) return fail("O saldo da conta tem de ser maior que zero.");
  if (!isPositiveFinite(maxRiskPercent) || maxRiskPercent > 100) return fail("O risco máximo tem de estar entre 0 e 100%.");
  if (!isPositiveFinite(entryPrice) || !isPositiveFinite(stopLoss) || !isPositiveFinite(takeProfit)) {
    return fail("Entrada, Stop Loss e Take Profit têm de ser preços positivos.");
  }

  const stopDistance = calculateStopDistance(direction, entryPrice, stopLoss);
  if (stopDistance <= 0) {
    return fail(direction === "LONG" ? "Num LONG o Stop Loss tem de ficar abaixo da entrada." : "Num SHORT o Stop Loss tem de ficar acima da entrada.");
  }
  const rewardDistance = direction === "LONG" ? takeProfit - entryPrice : entryPrice - takeProfit;
  if (rewardDistance <= 0) {
    return fail(direction === "LONG" ? "Num LONG o Take Profit tem de ficar acima da entrada." : "Num SHORT o Take Profit tem de ficar abaixo da entrada.");
  }

  const riskAmount = calculateMaxRiskAmount(balance, maxRiskPercent);
  const positionSize = calculatePositionSize(riskAmount, stopDistance);
  const notional = positionSize * entryPrice;

  return ok({
    riskAmount,
    stopDistance: roundTo(stopDistance, 8),
    stopDistancePct: roundTo((stopDistance / entryPrice) * 100, 4),
    positionSize: roundTo(positionSize, 8),
    notional: roundTo(notional, 2),
    effectiveLeverage: roundTo(notional / balance, 2),
    riskReward: calculateRiskReward(entryPrice, stopLoss, takeProfit),
    potentialProfit: roundTo(positionSize * rewardDistance, 2),
    potentialLoss: roundTo(riskAmount, 2),
  });
}

/** P&L de um trade fechado. LONG: (saída − entrada) × qty; SHORT: (entrada − saída) × qty. */
export function calculateTradePnl(direction: Direction, entryPrice: number, exitPrice: number, positionSize: number): number {
  const perUnit = direction === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return roundTo(perUnit * positionSize, 2);
}

/** Múltiplo R = P&L / risco inicial (|entrada − SL| × qty). */
export function calculateRMultiple(params: {
  direction: Direction;
  entryPrice: number;
  stopLoss: number;
  exitPrice: number;
  positionSize: number;
}): number | null {
  const initialRisk = Math.abs(params.entryPrice - params.stopLoss) * params.positionSize;
  if (initialRisk === 0 || !Number.isFinite(initialRisk)) return null;
  const pnl = (params.direction === "LONG" ? params.exitPrice - params.entryPrice : params.entryPrice - params.exitPrice) * params.positionSize;
  return roundTo(pnl / initialRisk, 2);
}

export interface JournalTrade {
  status: "OPEN" | "CLOSED" | "CANCELLED";
  net_pnl: number | null;
  r_multiple: number | null;
  closed_at: string | null;
}

export interface JournalStats {
  closedTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  /** Σ Ganhos / Σ |Perdas|. null sem trades; Infinity com ganhos e zero perdas. */
  profitFactor: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  averageR: number | null;
  /** Expectativa por trade = net / nº trades. */
  expectancy: number | null;
  maxDrawdown: number;
  equityCurve: { closedAt: string; cumulativePnl: number }[];
}

/** Profit_Factor = Σ Ganhos / Σ |Perdas|. */
export function calculateProfitFactor(pnls: readonly number[]): number | null {
  const gains = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const losses = pnls.filter((p) => p < 0).reduce((a, b) => a + Math.abs(b), 0);
  if (gains === 0 && losses === 0) return null;
  if (losses === 0) return Number.POSITIVE_INFINITY;
  return roundTo(gains / losses, 2);
}

export function calculateJournalStats(trades: readonly JournalTrade[]): JournalStats {
  const closed = trades
    .filter((t): t is JournalTrade & { net_pnl: number } => t.status === "CLOSED" && t.net_pnl !== null)
    .sort((a, b) => (a.closed_at ?? "").localeCompare(b.closed_at ?? ""));

  const pnls = closed.map((t) => t.net_pnl);
  const winsArr = pnls.filter((p) => p > 0);
  const lossesArr = pnls.filter((p) => p < 0);
  const grossProfit = winsArr.reduce((a, b) => a + b, 0);
  const grossLoss = lossesArr.reduce((a, b) => a + Math.abs(b), 0);
  const netPnl = grossProfit - grossLoss;
  const rValues = closed.map((t) => t.r_multiple).filter((r): r is number => r !== null);

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equityCurve = closed.map((t) => {
    cumulative += t.net_pnl;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    return { closedAt: t.closed_at ?? "", cumulativePnl: roundTo(cumulative, 2) };
  });

  return {
    closedTrades: closed.length,
    wins: winsArr.length,
    losses: lossesArr.length,
    breakeven: closed.length - winsArr.length - lossesArr.length,
    winRate: closed.length > 0 ? roundTo((winsArr.length / closed.length) * 100, 2) : null,
    grossProfit: roundTo(grossProfit, 2),
    grossLoss: roundTo(grossLoss, 2),
    netPnl: roundTo(netPnl, 2),
    profitFactor: calculateProfitFactor(pnls),
    averageWin: winsArr.length > 0 ? roundTo(grossProfit / winsArr.length, 2) : null,
    averageLoss: lossesArr.length > 0 ? roundTo(grossLoss / lossesArr.length, 2) : null,
    averageR: rValues.length > 0 ? roundTo(rValues.reduce((a, b) => a + b, 0) / rValues.length, 2) : null,
    expectancy: closed.length > 0 ? roundTo(netPnl / closed.length, 2) : null,
    maxDrawdown: roundTo(maxDrawdown, 2),
    equityCurve,
  };
}
