import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { KnowledgeHub, type HubMetrics } from "@/components/knowledge/KnowledgeHub";
import { NON_REVENUE_FINANCIAL_STATUSES } from "@/lib/calculations/unit-economics";
import { getDropshipData } from "@/lib/data/dropship";
import { getVaultSettings } from "@/lib/data/treasury";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Executive Playbook" };

export default async function KnowledgePage() {
  const { supabase, user } = await requireUser();
  const [dropship, vault] = await Promise.all([getDropshipData(supabase, user.id, 30), getVaultSettings(supabase, user.id)]);

  // Reembolsos/anulações do período (excluídos do P&L diário, mostrados na cascata).
  const fromIso = new Date(`${dropship.from}T00:00:00Z`).toISOString();
  const { data: refunded, error } = await supabase
    .from("dropship_orders")
    .select("total_price, status_financial")
    .eq("user_id", user.id)
    .gte("created_at", fromIso)
    .in("status_financial", [...NON_REVENUE_FINANCIAL_STATUSES]);
  if (error) throw new Error(error.message);

  const s = dropship.summary;
  const metrics: HubMetrics = {
    currency: dropship.currency,
    days: s.days,
    orders: s.orders,
    revenue: s.revenue,
    refunds: refunded.reduce((sum, o) => sum + Number(o.total_price), 0),
    cogs: s.cogs,
    shipping: s.shipping,
    gatewayFees: s.gatewayFees,
    adSpend: s.adSpend,
    netProfit: s.netProfit,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Playbook & Knowledge Hub"
        description="Academia em 3 níveis com os melhores do mundo em cada área do negócio, modelos mentais aplicados aos teus números e o manual fiscal e operacional de e-commerce."
      />
      <KnowledgeHub metrics={metrics} vault={vault} checklist={vault.checklist} />
    </div>
  );
}
