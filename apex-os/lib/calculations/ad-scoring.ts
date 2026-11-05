/**
 * Winner Score de criativos Meta (0–100).
 *
 *   Dias ativos  → 2.5 pontos/dia   (máx. 50)
 *   Cópias ativas → 5 pontos/cópia  (máx. 50)
 *   Em escala    → ≥ 5 cópias, ou ≥ 14 dias com ≥ 3 cópias
 *
 * Um anúncio que se mantém ativo muito tempo e é duplicado em várias cópias
 * é o sinal público mais forte de que está a dar lucro ao anunciante.
 */

export type AdTier = "NOVO" | "TESTE" | "ESTAVEL" | "WINNER_PROVAVEL" | "WINNER_ESCALA";

export interface AdMetricsInput {
  firstActiveDate: string | Date;
  activeCopiesCount: number;
}

export interface AdScoreResult {
  daysActive: number;
  /** 0 a 100. */
  winnerScore: number;
  isScaling: boolean;
  tier: AdTier;
}

export const AD_TIER_LABEL: Record<AdTier, string> = {
  NOVO: "Novo",
  TESTE: "Em teste",
  ESTAVEL: "Estável",
  WINNER_PROVAVEL: "Winner provável",
  WINNER_ESCALA: "Winner escala",
};

const DAY_MS = 1000 * 60 * 60 * 24;

export function calculateAdWinnerScore(input: AdMetricsInput, now: Date = new Date()): AdScoreResult {
  const start = new Date(input.firstActiveDate);
  const startMs = Number.isFinite(start.getTime()) ? start.getTime() : now.getTime();
  const diffTime = Math.abs(now.getTime() - startMs);
  const daysActive = Math.max(1, Math.ceil(diffTime / DAY_MS));
  const copies = Math.max(1, Math.trunc(Number.isFinite(input.activeCopiesCount) ? input.activeCopiesCount : 1));

  // Fórmula: dias ativos pesam 2.5 pontos (máx. 50) + cópias pesam 5 pontos (máx. 50).
  const timeWeight = Math.min(50, daysActive * 2.5);
  const scaleWeight = Math.min(50, copies * 5);
  const winnerScore = Math.min(100, Math.round(timeWeight + scaleWeight));

  const isScaling = copies >= 5 || (daysActive >= 14 && copies >= 3);

  let tier: AdTier = "NOVO";
  if (winnerScore >= 80) tier = "WINNER_ESCALA";
  else if (winnerScore >= 60) tier = "WINNER_PROVAVEL";
  else if (winnerScore >= 35) tier = "ESTAVEL";
  else if (daysActive >= 3) tier = "TESTE";

  return { daysActive, winnerScore, isScaling, tier };
}

/** Tier a partir do score e dos dias já guardados (para a UI, sem recalcular datas). */
export function tierFromScore(winnerScore: number, daysActive: number): AdTier {
  if (winnerScore >= 80) return "WINNER_ESCALA";
  if (winnerScore >= 60) return "WINNER_PROVAVEL";
  if (winnerScore >= 35) return "ESTAVEL";
  if (daysActive >= 3) return "TESTE";
  return "NOVO";
}
