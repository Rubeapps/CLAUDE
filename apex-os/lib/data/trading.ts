import "server-only";

import { checkTradingCircuitBreaker, currentSessionStart, type CircuitBreakerResult } from "@/lib/calculations/engine";
import { calculateJournalStats, type JournalStats } from "@/lib/calculations/risk";
import type { TradingAccountRow, TradingJournalRow } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

export const DEFAULT_MAX_DAILY_LOSS_PERCENT = 3;
/** Cooldown obrigatório depois de fechar um trade em perda. */
export const LOSS_COOLDOWN_MS = 30 * 60 * 1000;

export interface CircuitState {
  breaker: CircuitBreakerResult;
  /** P&L realizado na sessão atual (00:00 UTC → agora). */
  sessionPnl: number;
  /** Saldo de abertura da sessão = saldo atual − P&L da sessão. */
  sessionStartBalance: number;
  maxDailyLossPercent: number;
  /** closed_at do último trade fechado em perda (qualquer sessão). */
  lastLossAt: string | null;
  /** Fim do cooldown de 30 min, se ainda estiver ativo. */
  cooldownUntil: string | null;
}

/** Calcula o circuit breaker da conta a partir dos trades fechados na sessão (queries por user_id + RLS). */
export async function getCircuitState(supabase: TypedSupabaseClient, userId: string, account: TradingAccountRow, now: Date = new Date()): Promise<CircuitState> {
  const sessionStart = currentSessionStart(now).toISOString();
  const [sessionRes, lossRes] = await Promise.all([
    supabase.from("trading_journal").select("net_pnl").eq("user_id", userId).eq("account_id", account.id).eq("status", "CLOSED").gte("closed_at", sessionStart),
    supabase
      .from("trading_journal")
      .select("closed_at")
      .eq("user_id", userId)
      .eq("account_id", account.id)
      .eq("status", "CLOSED")
      .lt("net_pnl", 0)
      .order("closed_at", { ascending: false })
      .limit(1),
  ]);
  if (sessionRes.error) throw new Error(sessionRes.error.message);
  if (lossRes.error) throw new Error(lossRes.error.message);

  const sessionPnl = Math.round(sessionRes.data.reduce((sum, t) => sum + Number(t.net_pnl ?? 0), 0) * 100) / 100;
  const sessionStartBalance = Math.max(0, Number(account.balance) - sessionPnl);
  const maxDailyLossPercent = account.max_daily_loss_percent === null ? DEFAULT_MAX_DAILY_LOSS_PERCENT : Number(account.max_daily_loss_percent);
  const lastLossAt = lossRes.data[0]?.closed_at ?? null;
  const cooldownEnd = lastLossAt ? new Date(lastLossAt).getTime() + LOSS_COOLDOWN_MS : 0;

  return {
    breaker: checkTradingCircuitBreaker(Math.max(0, -sessionPnl), sessionStartBalance, maxDailyLossPercent, now),
    sessionPnl,
    sessionStartBalance,
    maxDailyLossPercent,
    lastLossAt,
    cooldownUntil: cooldownEnd > now.getTime() ? new Date(cooldownEnd).toISOString() : null,
  };
}

export interface TradingData {
  accounts: TradingAccountRow[];
  selectedAccount: TradingAccountRow | null;
  trades: TradingJournalRow[];
  openTrades: TradingJournalRow[];
  stats: JournalStats;
  circuit: CircuitState | null;
}

function toNumberOrNull(value: number | null): number | null {
  return value === null ? null : Number(value);
}

export function normalizeAccount(a: TradingAccountRow): TradingAccountRow {
  return {
    ...a,
    balance: Number(a.balance),
    max_risk_percent: Number(a.max_risk_percent),
    max_daily_loss_percent: a.max_daily_loss_percent === null ? null : Number(a.max_daily_loss_percent),
  };
}

export function normalizeTrade(t: TradingJournalRow): TradingJournalRow {
  return {
    ...t,
    entry_price: Number(t.entry_price),
    stop_loss: Number(t.stop_loss),
    take_profit: Number(t.take_profit),
    position_size: Number(t.position_size),
    exit_price: toNumberOrNull(t.exit_price),
    net_pnl: toNumberOrNull(t.net_pnl),
    r_multiple: toNumberOrNull(t.r_multiple),
  };
}

export async function getTradingData(supabase: TypedSupabaseClient, userId: string, accountId?: string): Promise<TradingData> {
  const { data: accountRows, error: accountsError } = await supabase.from("trading_accounts").select("*").eq("user_id", userId).order("created_at", { ascending: true });
  if (accountsError) throw new Error(accountsError.message);

  const accounts = accountRows.map(normalizeAccount);
  const selectedAccount = accounts.find((a) => a.id === accountId) ?? accounts[0] ?? null;

  let trades: TradingJournalRow[] = [];
  if (selectedAccount) {
    const { data, error } = await supabase
      .from("trading_journal")
      .select("*")
      .eq("user_id", userId)
      .eq("account_id", selectedAccount.id)
      .order("executed_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    trades = data.map(normalizeTrade);
  }

  return {
    accounts,
    selectedAccount,
    trades,
    openTrades: trades.filter((t) => t.status === "OPEN"),
    stats: calculateJournalStats(trades),
    circuit: selectedAccount ? await getCircuitState(supabase, userId, selectedAccount) : null,
  };
}

/** Estatísticas agregadas de todas as contas (usado no dashboard principal). */
export async function getAllTradingStats(supabase: TypedSupabaseClient, userId: string): Promise<{ accounts: TradingAccountRow[]; stats: JournalStats; openCount: number }> {
  const [accountsRes, tradesRes] = await Promise.all([
    supabase.from("trading_accounts").select("*").eq("user_id", userId),
    supabase.from("trading_journal").select("*").eq("user_id", userId).order("executed_at", { ascending: false }).limit(2000),
  ]);
  if (accountsRes.error) throw new Error(accountsRes.error.message);
  if (tradesRes.error) throw new Error(tradesRes.error.message);
  const trades = tradesRes.data.map(normalizeTrade);
  return {
    accounts: accountsRes.data.map(normalizeAccount),
    stats: calculateJournalStats(trades),
    openCount: trades.filter((t) => t.status === "OPEN").length,
  };
}
