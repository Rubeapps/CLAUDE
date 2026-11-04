"use client";

import { Landmark, LineChart, Rocket, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { saveWarChest } from "@/app/(dashboard)/dashboard/actions";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/action-state";
import { calculateWarChestAllocation } from "@/lib/calculations/engine";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  settings: { reinvestPct: number; emergencyPct: number; tradingPct: number; cashReserve: number; updatedAt: string | null };
  todayProfit: number;
  periodProfit: number;
  periodDays: number;
  currency: string;
}

function num(value: string): number {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** War Chest: divide o lucro líquido entre reinvestimento, reserva de emergência/impostos e injeção no trading. */
export function WarChestPanel({ settings, todayProfit, periodProfit, periodDays, currency }: Props) {
  const [reinvest, setReinvest] = useState(String(settings.reinvestPct));
  const [emergency, setEmergency] = useState(String(settings.emergencyPct));
  const [trading, setTrading] = useState(String(settings.tradingPct));
  const [reserve, setReserve] = useState(String(settings.cashReserve));
  const [state, formAction] = useActionState(saveWarChest, idleState);

  const split = { reinvestPct: num(reinvest), emergencyPct: num(emergency), tradingPct: num(trading) };
  const today = calculateWarChestAllocation(todayProfit, split);
  const period = calculateWarChestAllocation(periodProfit, split);
  const sum = split.reinvestPct + split.emergencyPct + split.tradingPct;
  const reserveNum = num(reserve);

  const channels = [
    { key: "reinvest", label: "Reinvestir (ads/stock)", icon: Rocket, today: today.reinvest, period: period.reinvest, color: "bg-primary", pct: split.reinvestPct },
    { key: "emergency", label: "Reserva / impostos", icon: ShieldCheck, today: today.emergency, period: period.emergency, color: "bg-amber-400", pct: split.emergencyPct },
    { key: "trading", label: "Injeção no trading", icon: LineChart, today: today.trading, period: period.trading, color: "bg-success", pct: split.tradingPct },
  ] as const;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-4">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          {channels.map((c) => (
            <div key={c.key} className={c.color} style={{ width: `${Number.isFinite(c.pct) ? Math.max(0, Math.min(100, c.pct)) : 0}%` }} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {channels.map(({ key, label, icon: Icon, today: t, period: p }) => (
            <div key={key} className="rounded-md border p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5" /> {label}
              </p>
              <p className="text-lg font-semibold tabular-nums">{formatCurrency(p, currency)}</p>
              <p className="text-xs text-muted-foreground">
                {periodDays}d · hoje {formatCurrency(t, currency)}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3 text-sm">
          <span className="flex items-center gap-1.5">
            <Landmark className="h-4 w-4 text-muted-foreground" /> Reserva atual{" "}
            <strong className="tabular-nums">{formatCurrency(Number.isFinite(reserveNum) ? reserveNum : 0, currency)}</strong>
          </span>
          <span className="text-xs text-muted-foreground">
            Projetada com a alocação de {periodDays}d:{" "}
            <strong className="tabular-nums text-foreground">{formatCurrency((Number.isFinite(reserveNum) ? reserveNum : 0) + period.emergency, currency)}</strong>
          </span>
        </div>
        {periodProfit <= 0 ? <p className="text-xs text-amber-400">Sem lucro líquido positivo no período: nada para alocar.</p> : null}
        {!period.valid && period.error ? <p className="text-xs text-destructive">{period.error}</p> : null}
      </div>

      <form action={formAction} className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label htmlFor="wc-reinvest">Reinvestir %</Label>
            <Input id="wc-reinvest" name="reinvest_percent" inputMode="decimal" value={reinvest} onChange={(e) => setReinvest(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wc-emergency">Reserva %</Label>
            <Input id="wc-emergency" name="emergency_tax_percent" inputMode="decimal" value={emergency} onChange={(e) => setEmergency(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wc-trading">Trading %</Label>
            <Input id="wc-trading" name="trading_injection_percent" inputMode="decimal" value={trading} onChange={(e) => setTrading(e.target.value)} />
          </div>
        </div>
        <p className={cn("text-xs", Math.round(sum * 100) === 10000 ? "text-muted-foreground" : "text-destructive")}>
          Soma: {Number.isFinite(sum) ? sum.toFixed(2) : "—"}% (tem de ser 100%)
        </p>
        <div className="space-y-1">
          <Label htmlFor="wc-reserve">Reserva de caixa atual ({currency})</Label>
          <Input id="wc-reserve" name="current_cash_reserve" inputMode="decimal" value={reserve} onChange={(e) => setReserve(e.target.value)} />
        </div>
        <SubmitButton className="w-full" pendingLabel="A guardar…" disabled={Math.round(sum * 100) !== 10000}>
          Guardar War Chest
        </SubmitButton>
        <ActionMessage state={state} />
      </form>
    </div>
  );
}
