import "server-only";

import type { WarChestSettingsRow } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

export interface WarChestSettings {
  reinvestPct: number;
  emergencyPct: number;
  tradingPct: number;
  cashReserve: number;
  updatedAt: string | null;
  /** false enquanto o utilizador nunca guardou definições (valores por omissão do schema). */
  persisted: boolean;
}

export const DEFAULT_WAR_CHEST: WarChestSettings = { reinvestPct: 50, emergencyPct: 30, tradingPct: 20, cashReserve: 0, updatedAt: null, persisted: false };

function fromRow(row: WarChestSettingsRow): WarChestSettings {
  return {
    reinvestPct: Number(row.reinvest_percent),
    emergencyPct: Number(row.emergency_tax_percent),
    tradingPct: Number(row.trading_injection_percent),
    cashReserve: Number(row.current_cash_reserve),
    updatedAt: row.updated_at,
    persisted: true,
  };
}

export async function getWarChestSettings(supabase: TypedSupabaseClient, userId: string): Promise<WarChestSettings> {
  const { data, error } = await supabase.from("war_chest_settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data) : DEFAULT_WAR_CHEST;
}
