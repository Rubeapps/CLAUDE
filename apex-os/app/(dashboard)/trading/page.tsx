import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { AccountsManager } from "@/components/trading/AccountsManager";
import { EquityChart } from "@/components/trading/EquityChart";
import { JournalTable } from "@/components/trading/JournalTable";
import { TradingTerminal } from "@/components/trading/TradingTerminal";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateMaxRiskAmount } from "@/lib/calculations/risk";
import { getTradingData } from "@/lib/data/trading";
import { formatNumber, formatPercent, formatRatio } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Trading" };

export default async function TradingPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams;
  const { supabase, user } = await requireUser();
  const data = await getTradingData(supabase, user.id, account);
  const { stats, selectedAccount } = data;
  const ccy = selectedAccount?.currency ?? "";

  const kpis = [
    { label: "Saldo", value: selectedAccount ? `${formatNumber(selectedAccount.balance)} ${ccy}` : "—" },
    {
      label: "Risco por trade",
      value: selectedAccount ? `${formatNumber(calculateMaxRiskAmount(selectedAccount.balance, selectedAccount.max_risk_percent))} ${ccy}` : "—",
      hint: selectedAccount ? `${selectedAccount.max_risk_percent}% do saldo` : undefined,
    },
    { label: "P&L líquido", value: formatNumber(stats.netPnl), tone: stats.netPnl > 0 ? "positive" : stats.netPnl < 0 ? "negative" : undefined },
    { label: "Profit Factor", value: formatRatio(stats.profitFactor, ""), hint: "Σ ganhos / Σ |perdas|" },
    { label: "Win rate", value: formatPercent(stats.winRate), hint: `${stats.wins}W / ${stats.losses}L` },
    { label: "Média R", value: stats.averageR === null ? "—" : `${stats.averageR.toFixed(2)}R`, hint: `Max DD ${formatNumber(stats.maxDrawdown)}` },
    {
      label: "P&L da sessão",
      value: data.circuit ? formatNumber(data.circuit.sessionPnl) : "—",
      hint: data.circuit ? `Limite −${formatNumber(data.circuit.breaker.maxDailyLoss)} (${data.circuit.maxDailyLossPercent}%)${data.circuit.breaker.isLocked ? " · BLOQUEADO" : ""}` : undefined,
      tone: data.circuit ? (data.circuit.breaker.isLocked ? "negative" : data.circuit.sessionPnl > 0 ? "positive" : data.circuit.sessionPnl < 0 ? "negative" : undefined) : undefined,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trading Terminal & Journal"
        description="Dimensiona cada posição pelo risco, regista e mede a tua performance."
        actions={
          <Link href="/trading/bots" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Trading Bots
          </Link>
        }
      />

      <AccountsManager accounts={data.accounts} selectedId={selectedAccount?.id ?? null} />

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-7">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={cn("text-xl font-semibold tabular-nums", "tone" in k && k.tone === "positive" && "text-success", "tone" in k && k.tone === "negative" && "text-destructive")}>{k.value}</p>
              {"hint" in k && k.hint ? <p className="text-xs text-muted-foreground">{k.hint}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <TradingTerminal account={selectedAccount} circuit={data.circuit} openTrades={data.openTrades} />

      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Curva de capital</CardTitle>
            <CardDescription>P&L acumulado dos trades fechados ({stats.closedTrades}).</CardDescription>
          </CardHeader>
          <CardContent>
            <EquityChart points={stats.equityCurve} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Diário</CardTitle>
            <CardDescription>Fechar um trade calcula P&L e múltiplo R e atualiza o saldo da conta.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[520px] overflow-y-auto">
            <JournalTable trades={data.trades} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
