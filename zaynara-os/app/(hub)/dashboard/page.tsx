import { AlertTriangle, Info, PlugZap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { LowStockTable } from "@/components/dashboard/low-stock-table";
import { ProfitRevenueChart } from "@/components/dashboard/profit-revenue-chart";
import { RangeSelect } from "@/components/dashboard/range-select";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadDashboard, RANGE_OPTIONS, type RangeDays } from "@/lib/dashboard/load";
import { formatEur, formatNumber, formatShortDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard · Zaynara OS" };

const VAT_LABEL = {
  exempt: "Isento (art. 53.º CIVA)",
  pt_standard: "IVA português",
  oss: "OSS",
} as const;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const requested = Number(params.days);
  const days: RangeDays = (RANGE_OPTIONS as readonly number[]).includes(requested) ? (requested as RangeDays) : 30;

  const data = await loadDashboard(days);
  const { totals, alternative } = data.result;
  const exempt = data.settings.vatMode === "exempt";
  const together = data.settings.shippingMode === "together";

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${formatShortDate(data.from)} – ${formatShortDate(data.to)} · ${totals.orders} encomendas · ${VAT_LABEL[data.settings.vatMode]}`}
      >
        <RangeSelect current={days} />
      </PageHeader>

      <div className="grid gap-4">
        {data.sources.map((s) => (
          <Alert key={`${s.source}-${s.message}`} variant={s.kind === "error" ? "destructive" : "warning"}>
            <PlugZap />
            <AlertTitle>{s.source}</AlertTitle>
            <AlertDescription>{s.message}</AlertDescription>
          </Alert>
        ))}

        {!data.hasCostTable && data.sources.every((s) => s.source !== "Tabela de custos") && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Tabela de custos vazia</AlertTitle>
            <AlertDescription>
              Sem a tabela do fornecedor, o COGS e os portes ficam a zero. Corre
              <code className="mx-1">supabase/seed/supplier_rates.sql</code>no SQL Editor do Supabase.
            </AlertDescription>
          </Alert>
        )}

        {/* O Santo Graal */}
        <div className="grid gap-4 sm:grid-cols-2">
          <KpiCard
            label="Lucro líquido real"
            value={formatEur(totals.netProfit)}
            tone={totals.netProfit < 0 ? "negative" : "positive"}
            emphasis
            hint={
              totals.netMargin === null
                ? "Sem receita no período"
                : `Margem líquida ${formatNumber(totals.netMargin * 100, 1)} %`
            }
          />
          <KpiCard
            label="ROAS global"
            value={totals.roas === null ? "—" : `${formatNumber(totals.roas)}×`}
            emphasis
            hint={
              totals.breakEvenRoas === null
                ? "Break-even indisponível (sem margem de contribuição)"
                : `Break-even: ${formatNumber(totals.breakEvenRoas)}× — abaixo disto perdes dinheiro`
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <KpiCard
            label="Receita bruta"
            value={formatEur(totals.grossRevenue)}
            hint={totals.vatCollected > 0 ? `IVA cobrado: ${formatEur(totals.vatCollected)}` : undefined}
          />
          <KpiCard label="Custo de mercadorias" value={formatEur(totals.cogs)} hint="Produto, pela tabela do fornecedor" />
          <KpiCard
            label="Gastos em anúncios"
            value={formatEur(totals.adSpend)}
            hint={exempt && totals.adSpendReported > 0 ? `Meta: ${formatEur(totals.adSpendReported)} + IVA ${data.settings.vatRate} %` : undefined}
          />
          <KpiCard label="Portes" value={formatEur(totals.shipping)} hint={together ? "Envio conjunto" : "Envios separados"} />
          <KpiCard label="Taxas de gateway" value={formatEur(totals.gatewayFees)} hint="Shopify Payments (real)" />
        </div>

        {data.result.estimatedOrders > 0 && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>
              {data.result.estimatedOrders} encomenda{data.result.estimatedOrders === 1 ? "" : "s"} com custo estimado
            </AlertTitle>
            <AlertDescription>
              <ul className="list-inside list-disc">
                {data.result.estimateNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <p>
                Envio {together ? "conjunto" : "separado"}. Se fosse {together ? "separado" : "conjunto"}, produto + portes
                seriam {formatEur(alternative.cogsPlusShipping)} (
                {alternative.difference >= 0 ? "+" : ""}
                {formatEur(alternative.difference)}).
              </p>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Receita vs lucro</CardTitle>
            <CardDescription>Por dia; o lucro já desconta anúncios, produto, portes e taxas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfitRevenueChart data={data.result.daily} />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Stock baixo</CardTitle>
              <CardDescription>Produtos ativos com menos de {data.lowStockThreshold} unidades</CardDescription>
            </CardHeader>
            <CardContent>
              {data.lowStock === null ? (
                <p className="text-sm text-muted-foreground">Indisponível (ver aviso da Shopify acima).</p>
              ) : (
                <LowStockTable items={data.lowStock} threshold={data.lowStockThreshold} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Qualidade dos dados</CardTitle>
              <CardDescription>O que pode estar a falsear o lucro</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {data.result.issues.length === 0 && data.result.unmappedProducts.length === 0 ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Info className="size-4" /> Todas as encomendas têm custo calculado.
                </p>
              ) : (
                <>
                  {data.result.unmappedProducts.length > 0 && (
                    <p>
                      Produtos sem tabela de custos: {data.result.unmappedProducts.join(", ")}.{" "}
                      <Link href="/settings" className="underline underline-offset-4">
                        Associar nas Definições
                      </Link>
                    </p>
                  )}
                  <ul className="grid max-h-48 gap-1 overflow-y-auto text-muted-foreground">
                    {data.result.issues.map((issue, i) => (
                      <li key={`${issue.order}-${i}`}>
                        <span className="font-medium text-foreground">{issue.order}</span> — {issue.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {data.fx.fallback && (
                <p className="text-muted-foreground">
                  Câmbio USD→EUR indisponível; a usar a taxa de reserva {data.fx.toEur.USD}.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
