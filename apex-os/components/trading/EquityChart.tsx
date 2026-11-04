"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "@/lib/format";

export function EquityChart({ points, height = 220 }: { points: { closedAt: string; cumulativePnl: number }[]; height?: number }) {
  const data = [{ label: "início", value: 0 }, ...points.map((p, i) => ({ label: `#${i + 1}`, value: p.cumulativePnl }))];
  const positive = (points[points.length - 1]?.cumulativePnl ?? 0) >= 0;
  const color = positive ? "hsl(152 60% 45%)" : "hsl(0 72% 58%)";

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(223 22% 18%)" vertical={false} />
          <XAxis dataKey="label" stroke="hsl(215 20% 65%)" fontSize={11} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis stroke="hsl(215 20% 65%)" fontSize={11} tickLine={false} axisLine={false} width={60} tickFormatter={(v: number) => formatNumber(v, 0)} />
          <Tooltip
            contentStyle={{ background: "hsl(224 28% 9%)", border: "1px solid hsl(223 22% 18%)", borderRadius: 8, fontSize: 12 }}
            formatter={(value) => [formatNumber(Number(value)), "P&L acumulado"]}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#equityFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
