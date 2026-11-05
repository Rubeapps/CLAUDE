"use client";

import { Brain, Lock, ShieldAlert, ShieldCheck, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CircuitBreakerResult } from "@/lib/calculations/engine";
import type { MentalState } from "@/lib/database.types";
import { cn } from "@/lib/utils";

export const FOMO_CHECKS = [
  { id: "strategy", label: "O setup cumpre 100% as regras da estratégia?" },
  { id: "structure", label: "O Stop Loss está posicionado num nível técnico e estrutural?" },
  { id: "dailyRisk", label: "O risco monetário respeita o limite diário da conta?" },
  { id: "cooldown", label: "Não fechei uma operação em perda nos últimos 30 minutos?" },
] as const;

type CheckId = (typeof FOMO_CHECKS)[number]["id"];

export const MENTAL_STATES: readonly { value: MentalState; label: string; blocked: boolean }[] = [
  { value: "CALM", label: "Calmo", blocked: false },
  { value: "FOCUSED", label: "Focado", blocked: false },
  { value: "TIRED", label: "Cansado", blocked: false },
  { value: "ANXIOUS", label: "Ansioso", blocked: false },
  { value: "EUPHORIC", label: "Eufórico (bloqueia)", blocked: true },
  { value: "REVENGE", label: "Vingança / recuperar perdas (bloqueia)", blocked: true },
];

export interface GatekeeperStatus {
  passed: boolean;
  locked: boolean;
  mentalState: MentalState;
}

export interface AntiFomoGatekeeperProps {
  circuit: CircuitBreakerResult;
  currency: string;
  /** Risco monetário do trade em preparação (para validar a regra 3). null se ainda não calculado. */
  tradeRisk: number | null;
  /** Fim do cooldown de 30 min após uma perda (ISO), se ativo. */
  cooldownUntil: string | null;
  /** Incrementar para limpar o checklist (ex.: depois de registar um trade). */
  resetKey?: number;
  onStatusChange: (status: GatekeeperStatus) => void;
  /** Campos do formulário de trade: ficam desativados quando o circuit breaker está ativo. */
  children: ReactNode;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Barreira pré-execução: 4 confirmações obrigatórias + estado mental.
 * Com o circuit breaker diário ativo (perda ≥ limite) substitui tudo por um banner de bloqueio
 * com contagem decrescente até à próxima sessão (00:00 UTC) e desativa os inputs.
 * Escreve `fomo_check_passed` e `mental_state` como inputs escondidos do formulário-pai.
 */
export function AntiFomoGatekeeper({ circuit, currency, tradeRisk, cooldownUntil, resetKey = 0, onStatusChange, children }: AntiFomoGatekeeperProps) {
  const router = useRouter();
  const now = useNow();
  const [checks, setChecks] = useState<Record<CheckId, boolean>>({ strategy: false, structure: false, dailyRisk: false, cooldown: false });
  const [mentalState, setMentalState] = useState<MentalState>("CALM");

  const unlockMs = new Date(circuit.unlocksAt).getTime() - now;
  const locked = circuit.isLocked && unlockMs > 0;
  const cooldownMs = cooldownUntil ? new Date(cooldownUntil).getTime() - now : 0;
  const cooldownActive = cooldownMs > 0;
  const riskExceedsDaily = tradeRisk !== null && tradeRisk > circuit.remainingLoss + 0.01;
  const mentalBlocked = MENTAL_STATES.find((m) => m.value === mentalState)?.blocked ?? false;

  // Quando a sessão vira (ou o cooldown acaba), pede ao servidor o estado atualizado.
  useEffect(() => {
    if (circuit.isLocked && unlockMs <= 0) router.refresh();
  }, [circuit.isLocked, unlockMs, router]);
  useEffect(() => {
    if (cooldownUntil && cooldownMs <= 0) router.refresh();
  }, [cooldownUntil, cooldownMs, router]);

  useEffect(() => {
    setChecks({ strategy: false, structure: false, dailyRisk: false, cooldown: false });
  }, [resetKey]);

  // Regras que o sistema consegue verificar sozinho desmarcam a caixa correspondente.
  useEffect(() => {
    if (riskExceedsDaily) setChecks((c) => (c.dailyRisk ? { ...c, dailyRisk: false } : c));
  }, [riskExceedsDaily]);
  useEffect(() => {
    if (cooldownActive) setChecks((c) => (c.cooldown ? { ...c, cooldown: false } : c));
  }, [cooldownActive]);

  const allChecked = FOMO_CHECKS.every((c) => checks[c.id]);
  const passed = !locked && allChecked && !mentalBlocked && !cooldownActive && !riskExceedsDaily;

  const status = useMemo<GatekeeperStatus>(() => ({ passed, locked, mentalState }), [passed, locked, mentalState]);
  useEffect(() => {
    onStatusChange(status);
  }, [status, onStatusChange]);

  const usedPct = Math.min(100, Math.max(0, circuit.usedPct));

  if (locked) {
    return (
      <div className="space-y-4">
        <div role="alert" className="space-y-3 rounded-lg border border-destructive bg-destructive/15 p-4 text-destructive">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="h-5 w-5" /> CIRCUIT BREAKER — TERMINAL BLOQUEADO
          </div>
          <p className="text-sm">
            Perda diária de <strong>{circuit.dailyLoss.toFixed(2)} {currency}</strong> atingiu o limite de <strong>{circuit.maxDailyLoss.toFixed(2)} {currency}</strong>. Nenhuma nova
            operação é permitida nesta sessão.
          </p>
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide">Próxima sessão em</span>
            <span className="font-mono text-2xl font-bold tabular-nums">{formatCountdown(unlockMs)}</span>
          </div>
        </div>
        <fieldset disabled aria-disabled="true" className="pointer-events-none select-none opacity-40">
          {children}
        </fieldset>
        <input type="hidden" name="fomo_check_passed" value="false" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {children}

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {passed ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-amber-400" />}
            Checklist anti-FOMO
          </p>
          <span className="text-xs text-muted-foreground">
            Limite diário {usedPct.toFixed(0)}% usado · restam {circuit.remainingLoss.toFixed(2)} {currency}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full transition-all", usedPct >= 66 ? "bg-destructive" : usedPct >= 33 ? "bg-amber-400" : "bg-success")} style={{ width: `${usedPct}%` }} />
        </div>

        <ul className="space-y-2">
          {FOMO_CHECKS.map((check) => {
            const disabled = (check.id === "dailyRisk" && riskExceedsDaily) || (check.id === "cooldown" && cooldownActive);
            return (
              <li key={check.id}>
                <label className={cn("flex cursor-pointer items-start gap-2 text-sm", disabled && "cursor-not-allowed opacity-60")}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                    checked={checks[check.id]}
                    disabled={disabled}
                    onChange={(e) => setChecks((c) => ({ ...c, [check.id]: e.target.checked }))}
                  />
                  <span>
                    {check.label}
                    {check.id === "dailyRisk" && riskExceedsDaily ? (
                      <span className="block text-xs text-destructive">
                        Risco do trade {tradeRisk?.toFixed(2)} {currency} &gt; restante do dia {circuit.remainingLoss.toFixed(2)} {currency}. Reduz o tamanho ou afasta o stop.
                      </span>
                    ) : null}
                    {check.id === "cooldown" && cooldownActive ? (
                      <span className="block text-xs text-destructive">Cooldown pós-perda ativo: {formatCountdown(cooldownMs)}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="space-y-1">
          <Label htmlFor="mental_state" className="flex items-center gap-1">
            <Brain className="h-3 w-3" /> Estado mental agora
          </Label>
          <Select id="mental_state" value={mentalState} onChange={(e) => setMentalState(e.target.value as MentalState)}>
            {MENTAL_STATES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          {mentalBlocked ? <p className="text-xs text-destructive">Decisões em {mentalState === "REVENGE" ? "modo vingança" : "euforia"} são a origem clássica do FOMO. Execução bloqueada.</p> : null}
          {mentalState === "TIRED" || mentalState === "ANXIOUS" ? <p className="text-xs text-amber-400">Considera reduzir o risco para metade neste estado.</p> : null}
        </div>
      </div>

      <input type="hidden" name="fomo_check_passed" value={passed ? "true" : "false"} />
      <input type="hidden" name="mental_state" value={mentalState} />
    </div>
  );
}
