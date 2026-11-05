import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { AdFatigueRadar } from "@/components/dropship/AdFatigueRadar";
import { AdSpendManager } from "@/components/dropship/AdSpendManager";
import { MetricsCards } from "@/components/dropship/MetricsCards";
import { ProductCostsTable } from "@/components/dropship/ProductCostsTable";
import { ProductsManager } from "@/components/dropship/ProductsManager";
import { ProfitChart } from "@/components/dropship/ProfitChart";
import { ScenarioSimulator } from "@/components/dropship/ScenarioSimulator";
import { StoreConnect } from "@/components/dropship/StoreConnect";
import { PageHeader } from "@/components/layout/PageHeader";
import { RangeTabs } from "@/components/layout/RangeTabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NON_REVENUE_FINANCIAL_STATUSES } from "@/lib/calculations/unit-economics";
import { getDropshipData, getLatestAdCreatives, parseRange, RANGE_OPTIONS } from "@/lib/data/dropship";
import { formatCurrency, formatDateTime, formatPercent, formatRatio, formatShortDate } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dropshipping P&L" };

export default async function DropshipPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const rangeDays = parseRange(range);
  const { supabase, user } = await requireUser();
  const [data, siteUrl, creatives] = await Promise.all([getDropshipData(supabase, user.id, rangeDays), getSiteUrl(), getLatestAdCreatives(supabase, user.id)]);
  const { currency } = data;
  const dailyDesc = [...data.daily].reverse();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dropshipping P&L"
        description={`Unit economics e lucro líquido de ${data.from} a ${data.to}.`}
        actions={<RangeTabs basePath="/dropship" current={rangeDays} options={RANGE_OPTIONS} />}
      />

      <MetricsCards summary={data.summary} today={data.today} currency={currency} />

      <Card>
        <CardHeader>
          <CardTitle>Faturação, ad spend e lucro líquido diário</CardTitle>
          <CardDescription>Net_Profit_Dia = Σ Lucro das encomendas − Ad spend do dia.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfitChart daily={data.daily} currency={currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulador de cenários (what-if)</CardTitle>
          <CardDescription>E se o CPA subir, o fornecedor aumentar os portes ou as devoluções dispararem? Começa com os teus valores reais do período.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScenarioSimulator
            currency={currency}
            defaults={{
              aov: data.summary.aov ?? 35,
              cogsPerOrder: data.summary.orders > 0 ? data.summary.cogs / data.summary.orders : 8,
              shippingPerOrder: data.summary.orders > 0 ? data.summary.shipping / data.summary.orders : 4,
              cpa: data.summary.orders > 0 && data.summary.adSpend > 0 ? data.summary.adSpend / data.summary.orders : 15,
              ordersPerMonth: data.summary.orders > 0 ? (data.summary.orders / Math.max(1, data.summary.days)) * 30 : 100,
            }}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>P&L diário</CardTitle>
            <CardDescription>BE ROAS = Faturação / (Faturação − custos sem ads). ROAS acima do BE ⇒ lucro.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dia</TableHead>
                  <TableHead className="text-right">Enc.</TableHead>
                  <TableHead className="text-right">Faturação</TableHead>
                  <TableHead className="text-right">Lucro enc.</TableHead>
                  <TableHead className="text-right">Ads</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead className="text-right">BE ROAS</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyDesc.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell>{formatShortDate(d.date)}</TableCell>
                    <TableCell className="text-right">{d.orders}</TableCell>
                    <TableCell className="text-right">{formatCurrency(d.revenue, currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(d.orderProfit, currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(d.adSpend, currency)}</TableCell>
                    <TableCell className={cn("text-right font-medium", d.netProfit > 0 && "text-success", d.netProfit < 0 && "text-destructive")}>{formatCurrency(d.netProfit, currency)}</TableCell>
                    <TableCell className="text-right">{formatRatio(d.roas)}</TableCell>
                    <TableCell className="text-right">{formatRatio(d.breakEvenRoas)}</TableCell>
                    <TableCell className="text-right">{formatPercent(d.netMarginPct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ad spend</CardTitle>
            <CardDescription>Um registo por dia e plataforma (guardar de novo substitui o valor).</CardDescription>
          </CardHeader>
          <CardContent>
            <AdSpendManager entries={data.adSpend} today={data.to} currency={currency} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ad Fatigue Radar</CardTitle>
          <CardDescription>Hook rate = 3s plays / impressões · Hold rate = ThruPlays / 3s plays · Fadiga = frequência ≥ 2.2 ou (CPA &gt; break-even e CTR &lt; 1%).</CardDescription>
        </CardHeader>
        <CardContent>
          <AdFatigueRadar defaultBreakEvenCpa={data.breakEvenCpa} currency={currency} today={data.to} saved={creatives} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Encomendas recentes</CardTitle>
          <CardDescription>Recebidas pelo webhook Shopify. Lucro = Preço − (COGS + Portes + Taxa gateway).</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentOrders.length === 0 ? (
            <EmptyState icon={Inbox} title="Sem encomendas no período" description="Liga a tua loja Shopify abaixo e configura o webhook para começares a receber encomendas." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Encomenda</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead className="text-right">Portes</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                  <TableHead className="text-right">Lucro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentOrders.map((o) => {
                  const excluded = NON_REVENUE_FINANCIAL_STATUSES.has(o.status_financial);
                  return (
                    <TableRow key={o.id} className={cn(excluded && "opacity-50")}>
                      <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                      <TableCell>{formatDateTime(o.created_at)}</TableCell>
                      <TableCell className="text-xs">{o.gateway}</TableCell>
                      <TableCell>
                        <Badge variant={o.status_financial === "paid" ? "success" : excluded ? "destructive" : "secondary"}>{o.status_financial}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(o.total_price, o.currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(o.total_cogs, o.currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(o.total_shipping, o.currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(o.gateway_fee, o.currency)}</TableCell>
                      <TableCell className={cn("text-right font-medium", o.net_profit > 0 ? "text-success" : "text-destructive")}>{formatCurrency(o.net_profit, o.currency)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Custos por produto</CardTitle>
            <CardDescription>
              Atualiza aqui o COGS e os portes sempre que mudarem: o valor aplica-se a todas as variantes do produto. Encomendas novas usam o custo atual; as antigas mantêm o custo
              da altura.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProductCostsTable products={data.products} currency={currency} />
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Avançado: custos por SKU ({data.products.length})</summary>
              <div className="pt-4">
                <ProductsManager products={data.products} currency={currency} />
              </div>
            </details>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ligação Shopify</CardTitle>
            <CardDescription>Webhook assinado com HMAC-SHA256.</CardDescription>
          </CardHeader>
          <CardContent>
            <StoreConnect stores={data.stores} webhookUrl={`${siteUrl}/api/webhooks/shopify`} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
