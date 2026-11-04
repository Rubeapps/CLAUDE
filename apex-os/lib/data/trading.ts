import "server-only";

import { calculateJournalStats, type JournalStats } from "@/lib/calculations/risk";
import type { TradingAccountRow, TradingJournalRow } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

export interface TradingData {
  accounts: TradingAccountRow[];
  selectedAccount: TradingAccountRow | null;
  trades: TradingJournalRow[];
  openTrades: TradingJournalRow[];
  stats: JournalStats;
}

function toNumberOrNull(value: number | null): number | null {
  return value === null ? null : Number(value);
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

  const accounts = accountRows.map((a) => ({ ...a, balance: Number(a.balance), max_risk_percent: Number(a.max_risk_percent) }));
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
    accounts: accountsRes.data.map((a) => ({ ...a, balance: Number(a.balance), max_risk_percent: Number(a.max_risk_percent) })),
    stats: calculateJournalStats(trades),
    openCount: trades.filter((t) => t.status === "OPEN").length,
  };
}
