import "server-only";

import type { Json } from "@/lib/database.types";
import type { TypedSupabaseClient } from "@/lib/supabase/server";

export interface VaultSettings {
  vatPercent: number;
  incomeTaxPercent: number;
  rollingReservePercent: number;
  totalTaxReserved: number;
  lastReconciliation: string | null;
  checklist: Record<string, boolean>;
  persisted: boolean;
}

export const DEFAULT_VAULT: VaultSettings = {
  vatPercent: 23,
  incomeTaxPercent: 20,
  rollingReservePercent: 10,
  totalTaxReserved: 0,
  lastReconciliation: null,
  checklist: {},
  persisted: false,
};

export function checklistFromJson(value: Json): Record<string, boolean> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, v] of Object.entries(value)) if (typeof v === "boolean") out[key] = v;
  return out;
}

export async function getVaultSettings(supabase: TypedSupabaseClient, userId: string): Promise<VaultSettings> {
  const { data, error } = await supabase.from("treasury_tax_vault").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return DEFAULT_VAULT;
  return {
    vatPercent: Number(data.estimated_vat_percent),
    incomeTaxPercent: Number(data.estimated_income_tax_percent),
    rollingReservePercent: Number(data.rolling_reserve_percent),
    totalTaxReserved: Number(data.total_tax_reserved),
    lastReconciliation: data.last_reconciliation_date,
    checklist: checklistFromJson(data.compliance_checklist),
    persisted: true,
  };
}
