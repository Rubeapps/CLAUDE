import { Banknote, Crosshair, Megaphone, Package, Percent, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { DailyPnl, PnlSummary } from "@/lib/calculations/unit-economics";
import { formatCurrency, formatPercent, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Metric {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone?: "positive" | "negative" | "neutral";
}

function Metric({ label, value, hint, icon: Icon, tone = "neutral" }: Metric) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">{label}</span>
          <Icon className="h-4 w-4" />
        </div>
        <p className={cn("text-2xl font-semibold tabular-nums", tone === "positive" && "text-success", tone === "negative" && "text-destructive")}>{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function MetricsCards({ summary, today, currency }: { summary: PnlSummary; today: DailyPnl | null; currency: string }) {
  const roasVsBe =
    summary.roas !== null && summary.breakEvenRoas !== null ? (summary.roas >= summary.breakEvenRoas ? "acima do break-even" : "abaixo do break-even") : "sem dados suficientes";

  const metrics: Metric[] = [
    {
      label: "Faturação",
      value: formatCurrency(summary.revenue, currency),
      hint: `Hoje: ${formatCurrency(today?.revenue ?? 0, currency)}`,
      icon: Banknote,
    },
    {
      label: "Lucro líquido",
      value: formatCurrency(summary.netProfit, currency),
      hint: `Hoje: ${formatCurrency(today?.netProfit ?? 0, currency)} (após ads)`,
      icon: TrendingUp,
      tone: summary.netProfit > 0 ? "positive" : summary.netProfit < 0 ? "negative" : "neutral",
    },
    {
      label: "Encomendas",
      value: String(summary.orders),
      hint: `AOV ${summary.aov === null ? "—" : formatCurrency(summary.aov, currency)}`,
      icon: Package,
    },
    {
      label: "Ad spend",
      value: formatCurrency(summary.adSpend, currency),
      hint: `ROAS ${formatRatio(summary.roas)}`,
      icon: Megaphone,
    },
    {
      label: "Break-Even ROAS",
      value: formatRatio(summary.breakEvenRoas),
      hint: `ROAS atual ${roasVsBe}`,
      icon: Crosshair,
      tone: summary.roas !== null && summary.breakEvenRoas !== null ? (summary.roas >= summary.breakEvenRoas ? "positive" : "negative") : "neutral",
    },
    {
      label: "Margem líquida",
      value: formatPercent(summary.netMarginPct),
      hint: `COGS ${formatCurrency(summary.cogs, currency)} · Gateway ${formatCurrency(summary.gatewayFees, currency)}`,
      icon: Percent,
      tone: summary.netMarginPct !== null && summary.netMarginPct < 0 ? "negative" : "neutral",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {metrics.map((metric) => (
        <Metric key={metric.label} {...metric} />
      ))}
    </div>
  );
}
