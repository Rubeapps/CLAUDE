"use client";

import { Crosshair, ShieldAlert } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { logTrade } from "@/app/(dashboard)/trading/actions";
import { Button } from "@/components/ui/button";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/action-state";
import { pricePrecision } from "@/lib/binance";
import { calculatePositionPlan, type Direction } from "@/lib/calculations/risk";
import type { TradingAccountRow } from "@/lib/database.types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function parse(value: string): number {
  return Number.parseFloat(value.replace(",", "."));
}

export function RiskCalculator({ account, symbol, livePrice }: { account: TradingAccountRow | null; symbol: string; livePrice: number | null }) {
  const [direction, setDirection] = useState<Direction>("LONG");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [riskPct, setRiskPct] = useState(account ? String(account.max_risk_percent) : "1");
  const [notes, setNotes] = useState("");
  const [state, formAction] = useActionState(logTrade, idleState);

  useEffect(() => {
    if (account) setRiskPct(String(account.max_risk_percent));
  }, [account]);

  useEffect(() => {
    setEntry("");
    setStop("");
    setTarget("");
  }, [symbol]);

  useEffect(() => {
    if (state.status === "success") {
      setStop("");
      setTarget("");
      setNotes("");
    }
  }, [state]);

  const riskPctNum = parse(riskPct);
  const riskCapped = account !== null && Number.isFinite(riskPctNum) && riskPctNum > account.max_risk_percent;

  const plan = useMemo(() => {
    if (!account) return null;
    const values = [parse(entry), parse(stop), parse(target)];
    if (values.some((v) => !Number.isFinite(v))) return null;
    const [entryPrice, stopLoss, takeProfit] = values as [number, number, number];
    return calculatePositionPlan({
      direction,
      balance: account.balance,
      maxRiskPercent: Math.min(riskPctNum, account.max_risk_percent),
      entryPrice,
      stopLoss,
      takeProfit,
    });
  }, [account, direction, entry, stop, target, riskPctNum]);

  const precision = pricePrecision(livePrice ?? (parse(entry) || 1));

  if (!account) {
    return <p className="text-sm text-muted-foreground">Cria uma conta de trading para usar a calculadora.</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="account_id" value={account.id} />
      <input type="hidden" name="symbol" value={symbol} />
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="position_size" value={plan?.ok ? String(plan.value.positionSize) : ""} />

      <div className="grid grid-cols-2 gap-2">
        {(["LONG", "SHORT"] as const).map((d) => (
          <Button
            key={d}
            type="button"
            variant="outline"
            onClick={() => setDirection(d)}
            className={cn(direction === d && (d === "LONG" ? "border-success bg-success/15 text-success" : "border-destructive bg-destructive/15 text-destructive"))}
          >
            {d}
          </Button>
        ))}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="entry_price">Entrada</Label>
          {livePrice !== null ? (
            <button type="button" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => setEntry(livePrice.toFixed(precision))}>
              <Crosshair className="h-3 w-3" /> usar {livePrice.toFixed(precision)}
            </button>
          ) : null}
        </div>
        <Input id="entry_price" name="entry_price" inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="stop_loss">Stop Loss</Label>
          <Input id="stop_loss" name="stop_loss" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="take_profit">Take Profit</Label>
          <Input id="take_profit" name="take_profit" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="risk_pct">Risco por trade (%) — máx. da conta {account.max_risk_percent}%</Label>
        <Input id="risk_pct" inputMode="decimal" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} />
        {riskCapped ? (
          <p className="flex items-center gap-1 text-xs text-amber-400">
            <ShieldAlert className="h-3 w-3" /> Limitado ao máximo da conta ({account.max_risk_percent}%).
          </p>
        ) : null}
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        {plan === null ? (
          <p className="text-xs text-muted-foreground">Preenche entrada, SL e TP para calcular a posição.</p>
        ) : !plan.ok ? (
          <p className="text-xs text-destructive">{plan.error}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <dt className="text-xs text-muted-foreground">Risco monetário</dt>
              <dd className="font-semibold tabular-nums text-destructive">{formatCurrency(plan.value.riskAmount, account.currency.length === 3 ? account.currency : "USD")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Tamanho da posição</dt>
              <dd className="font-mono font-semibold tabular-nums">{formatNumber(plan.value.positionSize, 6)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Distância SL</dt>
              <dd className="tabular-nums">
                {formatNumber(plan.value.stopDistance, precision)} <span className="text-xs text-muted-foreground">({plan.value.stopDistancePct.toFixed(2)}%)</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">R:R</dt>
              <dd className={cn("font-semibold tabular-nums", (plan.value.riskReward ?? 0) >= 2 ? "text-success" : (plan.value.riskReward ?? 0) < 1 ? "text-destructive" : "")}>
                1 : {plan.value.riskReward?.toFixed(2) ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Notional</dt>
              <dd className="tabular-nums">
                {formatNumber(plan.value.notional)} <span className="text-xs text-muted-foreground">({plan.value.effectiveLeverage}x)</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Lucro potencial</dt>
              <dd className="font-semibold tabular-nums text-success">{formatNumber(plan.value.potentialProfit)}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notas / setup</Label>
        <Textarea id="notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: rejeição em resistência H1, confluência com VWAP" />
      </div>

      <SubmitButton className="w-full" disabled={!plan?.ok} pendingLabel="A registar…">
        Registar {direction} {symbol}
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
