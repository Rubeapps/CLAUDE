import { ArrowRight, CandlestickChart, Radar, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { WarChestPanel } from "@/components/dashboard/WarChestPanel";
import { ProfitChart } from "@/components/dropship/ProfitChart";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDropshipData } from "@/lib/data/dropship";
import { getSpyData } from "@/lib/data/spy";
import { getAllTradingStats } from "@/lib/data/trading";
import { getWarChestSettings } from "@/lib/data/war-chest";
import { formatCurrency, formatDateTime, formatNumber, formatPercent, formatRatio } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Visão geral" };

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tone === "positive" && "text-success", tone === "negative" && "text-destructive")}>{value}</p>
    </div>
  );
}

function toneOf(value: number): "positive" | "negative" | undefined {
  return value > 0 ? "positive" : value < 0 ? "negative" : undefined;
}

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const [dropship, spy, trading, warChest] = await Promise.all([
    getDropshipData(supabase, user.id, 30),
    getSpyData(supabase, user.id, 8),
    getAllTradingStats(supabase, user.id),
    getWarChestSettings(supabase, user.id),
  ]);
  const { summary, today, currency } = dropship;
  const totalBalance = trading.accounts.reduce((sum, a) => sum + a.balance, 0);
  const balanceCurrency = trading.accounts[0]?.currency ?? "USD";

  return (
    <div className="space-y-6">
      <PageHeader title="Visão geral" description="Os três motores do Apex OS num só ecrã (últimos 30 dias)." />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" /> Dropshipping
            </CardTitle>
            <Link href="/dropship" className="text-xs text-muted-foreground hover:text-foreground">
              Abrir <ArrowRight className="inline h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Stat label="Lucro líquido 30d" value={formatCurrency(summary.netProfit, currency)} tone={toneOf(summary.netProfit)} />
            <Stat label="Lucro hoje" value={formatCurrency(today?.netProfit ?? 0, currency)} tone={toneOf(today?.netProfit ?? 0)} />
            <Stat label="Faturação 30d" value={formatCurrency(summary.revenue, currency)} />
            <Stat label="Margem" value={formatPercent(summary.netMarginPct)} />
            <Stat label="ROAS" value={formatRatio(summary.roas)} />
            <Stat label="BE ROAS" value={formatRatio(summary.breakEvenRoas)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-primary" /> Spy Engine
            </CardTitle>
            <Link href="/spy" className="text-xs text-muted-foreground hover:text-foreground">
              Abrir <ArrowRight className="inline h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Lojas ativas" value={String(spy.totals.active)} />
              <Stat label="Produtos" value={formatNumber(spy.totals.products, 0)} />
              <Stat label="Preços 24h" value={String(spy.totals.changes24h)} />
            </div>
            <ul className="space-y-1.5 text-xs">
              {spy.priceChanges.slice(0, 4).map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span className="truncate">{c.product.title}</span>
                  <span className={cn("shrink-0 tabular-nums", c.newPrice < c.oldPrice ? "text-success" : "text-destructive")}>
                    {formatNumber(c.oldPrice)} → {formatNumber(c.newPrice)}
                  </span>
                </li>
              ))}
              {spy.priceChanges.length === 0 ? <li className="text-muted-foreground">Sem alterações de preço recentes.</li> : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <CandlestickChart className="h-4 w-4 text-primary" /> Trading
            </CardTitle>
            <Link href="/trading" className="text-xs text-muted-foreground hover:text-foreground">
              Abrir <ArrowRight className="inline h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Stat label="Saldo total" value={`${formatNumber(totalBalance)} ${balanceCurrency}`} />
            <Stat label="P&L fechado" value={formatNumber(trading.stats.netPnl)} tone={toneOf(trading.stats.netPnl)} />
            <Stat label="Profit Factor" value={formatRatio(trading.stats.profitFactor, "")} />
            <Stat label="Win rate" value={formatPercent(trading.stats.winRate)} />
            <Stat label="Trades abertos" value={String(trading.openCount)} />
            <Stat label="Média R" value={trading.stats.averageR === null ? "—" : `${trading.stats.averageR.toFixed(2)}R`} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>War Chest — alocação de capital</CardTitle>
          <CardDescription>Divide o lucro líquido do dropshipping entre reinvestimento, reserva de emergência/impostos e injeção na conta de trading.</CardDescription>
        </CardHeader>
        <CardContent>
          <WarChestPanel settings={warChest} todayProfit={today?.netProfit ?? 0} periodProfit={summary.netProfit} periodDays={summary.days} currency={currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>P&L de dropshipping — 30 dias</CardTitle>
          <CardDescription>Faturação, ad spend e lucro líquido diário.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfitChart daily={dropship.daily} currency={currency} height={260} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novos produtos da concorrência</CardTitle>
        </CardHeader>
        <CardContent>
          {spy.newest.length === 0 ? (
            <p className="text-sm text-muted-foreground">Adiciona lojas no Spy Engine para ver novidades aqui.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {spy.newest.slice(0, 8).map((p) => (
                <li key={p.id} className="rounded-md border p-3 text-sm">
                  <a href={`${p.storeUrl}/products/${encodeURIComponent(p.handle)}`} target="_blank" rel="noreferrer noopener" className="line-clamp-1 font-medium hover:underline">
                    {p.title}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {p.storeName} · {formatNumber(p.current_price)} · {formatDateTime(p.published_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
