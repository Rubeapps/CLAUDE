"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { simulateScenario, type ScenarioInput } from "@/lib/calculations/treasury";
import { formatCurrency, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ScenarioDefaults {
  aov: number;
  cogsPerOrder: number;
  shippingPerOrder: number;
  cpa: number;
  ordersPerMonth: number;
}

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

function Slider({ id, label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="font-mono text-xs font-semibold tabular-nums">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[hsl(var(--primary))]"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function num(value: string, fallback: number): number {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Simulador "what-if" de sensibilidade de margens: CPA, portes, devoluções e ticket médio.
 * Começa com os valores reais dos últimos 30 dias (quando existem).
 */
export function ScenarioSimulator({ defaults, currency }: { defaults: ScenarioDefaults; currency: string }) {
  const [aov, setAov] = useState(defaults.aov);
  const [cpa, setCpa] = useState(defaults.cpa);
  const [shippingDelta, setShippingDelta] = useState(0);
  const [returnRate, setReturnRate] = useState(3);
  const [cogs, setCogs] = useState(String(defaults.cogsPerOrder.toFixed(2)));
  const [shipping, setShipping] = useState(String(defaults.shippingPerOrder.toFixed(2)));
  const [orders, setOrders] = useState(String(Math.max(1, Math.round(defaults.ordersPerMonth))));
  const [fixed, setFixed] = useState("60");
  const [gatewayPct, setGatewayPct] = useState("1.5");

  const money = (v: number) => formatCurrency(v, currency);
  const aovMax = Math.max(100, Math.ceil((defaults.aov * 2) / 10) * 10);
  const cpaMax = Math.max(60, Math.ceil((defaults.cpa * 2.5) / 10) * 10);

  const input: ScenarioInput = {
    aov,
    cogsPerOrder: num(cogs, 0),
    shippingPerOrder: num(shipping, 0),
    shippingDelta,
    gatewayPercent: num(gatewayPct, 1.5),
    gatewayFixed: 0.25,
    cpa,
    returnRatePercent: returnRate,
    ordersPerMonth: num(orders, 0),
    fixedCostsMonthly: num(fixed, 0),
  };
  const result = simulateScenario(input);
  const baseline = simulateScenario({ ...input, aov: defaults.aov, cpa: defaults.cpa, shippingDelta: 0, returnRatePercent: 3 });
  const delta = result.monthlyNetProfit - baseline.monthlyNetProfit;
  const loss = result.profitPerOrder < 0;

  function reset() {
    setAov(defaults.aov);
    setCpa(defaults.cpa);
    setShippingDelta(0);
    setReturnRate(3);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Slider id="sim-cpa" label="Custo de aquisição (CPA)" value={cpa} min={0} max={cpaMax} step={0.5} format={money} onChange={setCpa} />
          <Slider id="sim-aov" label="Ticket médio" value={aov} min={5} max={aovMax} step={0.5} format={money} onChange={setAov} />
          <Slider
            id="sim-ship"
            label="Variação dos portes / encomenda"
            value={shippingDelta}
            min={-3}
            max={5}
            step={0.25}
            format={(v) => `${v > 0 ? "+" : ""}${money(v)}`}
            onChange={setShippingDelta}
          />
          <Slider id="sim-returns" label="Taxa de devolução" value={returnRate} min={0} max={30} step={0.5} format={(v) => `${v.toFixed(1)}%`} onChange={setReturnRate} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="sim-cogs">COGS / enc.</Label>
            <Input id="sim-cogs" inputMode="decimal" value={cogs} onChange={(e) => setCogs(e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sim-shipping">Portes / enc.</Label>
            <Input id="sim-shipping" inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sim-gw">Gateway %</Label>
            <Input id="sim-gw" inputMode="decimal" value={gatewayPct} onChange={(e) => setGatewayPct(e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sim-orders">Encomendas / mês</Label>
            <Input id="sim-orders" inputMode="numeric" value={orders} onChange={(e) => setOrders(e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sim-fixed">Fixos / mês</Label>
            <Input id="sim-fixed" inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} className="h-8" />
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={reset}>
          <RotateCcw /> Repor valores reais
        </Button>
        <p className="text-xs text-muted-foreground">
          Devoluções: perde-se a receita, mas COGS, portes, taxa do gateway e CPA já foram pagos. Taxa fixa do gateway: 0,25 € por encomenda.
        </p>
      </div>

      <div className={cn("space-y-4 rounded-lg border p-4", loss ? "border-destructive/50 bg-destructive/5" : "border-success/40 bg-success/5")}>
        <div>
          <p className="text-xs text-muted-foreground">Lucro líquido mensal estimado</p>
          <p className={cn("text-3xl font-semibold tabular-nums", result.monthlyNetProfit >= 0 ? "text-success" : "text-destructive")}>{money(result.monthlyNetProfit)}</p>
          <p className={cn("text-xs tabular-nums", delta >= 0 ? "text-success" : "text-destructive")}>
            {delta >= 0 ? "+" : ""}
            {money(delta)} vs. cenário atual
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Lucro por encomenda</dt>
            <dd className={cn("font-semibold tabular-nums", loss && "text-destructive")}>{money(result.profitPerOrder)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Break-even CPA</dt>
            <dd className="font-semibold tabular-nums">{money(result.breakEvenCpa)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Break-even ROAS</dt>
            <dd className="font-semibold tabular-nums">{formatRatio(result.breakEvenRoas)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">ROAS atual</dt>
            <dd className="font-semibold tabular-nums">{formatRatio(result.currentRoas)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Margem de segurança do CPA</dt>
            <dd className={cn("font-semibold tabular-nums", (result.safetyMarginPercent ?? 0) < 15 ? "text-destructive" : "text-success")}>
              {result.safetyMarginPercent === null ? "—" : `${result.safetyMarginPercent > 0 ? "+" : ""}${result.safetyMarginPercent.toFixed(1)}%`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Encomendas p/ cobrir fixos</dt>
            <dd className="font-semibold tabular-nums">{result.breakEvenOrders ?? "—"}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          {loss
            ? "Neste cenário cada encomenda dá prejuízo: baixa o CPA, sobe o ticket médio (bundles) ou renegocia custos."
            : result.safetyMarginPercent !== null && result.safetyMarginPercent < 15
              ? "Margem curta: uma subida pequena do CPM/CPA põe o negócio em prejuízo."
              : "O CPA pode subir até ao break-even indicado antes de entrares em prejuízo."}
        </p>
      </div>
    </div>
  );
}
