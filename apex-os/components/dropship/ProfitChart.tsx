"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyPnl } from "@/lib/calculations/unit-economics";
import { formatCurrency, formatShortDate } from "@/lib/format";

interface ChartPoint {
  date: string;
  label: string;
  revenue: number;
  adSpend: number;
  netProfit: number;
}

const COLORS = {
  revenue: "hsl(217 91% 60%)",
  adSpend: "hsl(35 92% 55%)",
  netProfit: "hsl(152 60% 45%)",
  grid: "hsl(223 22% 18%)",
  axis: "hsl(215 20% 65%)",
} as const;

const SERIES_LABEL: Record<"revenue" | "adSpend" | "netProfit", string> = {
  revenue: "Faturação",
  adSpend: "Ad spend",
  netProfit: "Lucro líquido",
};

export function ProfitChart({ daily, currency, height = 300 }: { daily: DailyPnl[]; currency: string; height?: number }) {
  const data: ChartPoint[] = daily.map((d) => ({ date: d.date, label: formatShortDate(d.date), revenue: d.revenue, adSpend: d.adSpend, netProfit: d.netProfit }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          <XAxis dataKey="label" stroke={COLORS.axis} fontSize={11} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis stroke={COLORS.axis} fontSize={11} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => formatCurrency(v, currency, 0)} />
          <Tooltip
            cursor={{ fill: "hsl(223 24% 16% / 0.5)" }}
            contentStyle={{ background: "hsl(224 28% 9%)", border: `1px solid ${COLORS.grid}`, borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: COLORS.axis }}
            formatter={(value, name) => [formatCurrency(Number(value), currency), SERIES_LABEL[name as keyof typeof SERIES_LABEL] ?? String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value: string) => SERIES_LABEL[value as keyof typeof SERIES_LABEL] ?? value} />
          <Bar dataKey="revenue" fill={COLORS.revenue} radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Bar dataKey="adSpend" fill={COLORS.adSpend} radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Line dataKey="netProfit" type="monotone" stroke={COLORS.netProfit} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
