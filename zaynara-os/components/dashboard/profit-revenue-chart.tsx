"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DailyPoint } from "@/lib/finance/metrics";
import { formatEur, formatShortDate } from "@/lib/utils";

const SERIES = [
  { key: "revenue", label: "Receita bruta", color: "var(--chart-1)" },
  { key: "profit", label: "Lucro líquido", color: "var(--chart-2)" },
] as const;

function ChartTooltip({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{formatShortDate(String(label))}</div>
      {SERIES.map((s) => {
        const item = payload.find((p) => p.dataKey === s.key);
        if (!item) return null;
        return (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tabular-nums">{formatEur(Number(item.value))}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ProfitRevenueChart({ data }: { data: DailyPoint[] }) {
  const [showTable, setShowTable] = useState(false);
  const last = data.at(-1);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legenda">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Ver gráfico" : "Ver tabela"}
        </Button>
      </div>

      {showTable ? (
        <div className="max-h-80 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dia</TableHead>
                <TableHead className="text-right">Receita bruta</TableHead>
                <TableHead className="text-right">Lucro líquido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((d) => (
                <TableRow key={d.date}>
                  <TableCell>{formatShortDate(d.date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEur(d.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEur(d.profit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="h-72 w-full" role="img" aria-label="Receita bruta e lucro líquido por dia">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 56, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                tickFormatter={(v: number) => `${Math.round(v)} €`}
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
              <Tooltip
                content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} />}
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              />
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                  isAnimationActive={false}
                  label={
                    last
                      ? ({ index, x, y }: { index?: number; x?: number | string; y?: number | string }) =>
                          index === data.length - 1 ? (
                            <text
                              x={Number(x) + 6}
                              y={Number(y)}
                              dy={4}
                              fontSize={11}
                              fill="var(--muted-foreground)"
                            >
                              {s.key === "revenue" ? "Receita" : "Lucro"}
                            </text>
                          ) : null
                      : undefined
                  }
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
