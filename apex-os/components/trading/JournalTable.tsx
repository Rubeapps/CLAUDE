"use client";

import { Ban, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { cancelTrade, closeTrade, deleteTrade } from "@/app/(dashboard)/trading/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idleState } from "@/lib/action-state";
import { calculateRiskReward } from "@/lib/calculations/risk";
import type { TradingJournalRow } from "@/lib/database.types";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function CloseForm({ trade }: { trade: TradingJournalRow }) {
  const [state, action] = useActionState(closeTrade, idleState);
  return (
    <div className="space-y-1">
      <form action={action} className="flex items-center gap-1">
        <input type="hidden" name="id" value={trade.id} />
        <Input name="exit_price" inputMode="decimal" placeholder="Saída" className="h-8 w-24 text-xs" required />
        <SubmitButton size="sm" pendingLabel="…">
          Fechar
        </SubmitButton>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

export function JournalTable({ trades }: { trades: TradingJournalRow[] }) {
  if (trades.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem trades nesta conta. Usa a calculadora para registar o primeiro.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Símbolo</TableHead>
          <TableHead>Dir.</TableHead>
          <TableHead className="text-right">Entrada</TableHead>
          <TableHead className="text-right">SL</TableHead>
          <TableHead className="text-right">TP</TableHead>
          <TableHead className="text-right">Qtd.</TableHead>
          <TableHead className="text-right">R:R</TableHead>
          <TableHead className="text-right">Saída</TableHead>
          <TableHead className="text-right">P&L</TableHead>
          <TableHead className="text-right">R</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Mente</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((t) => (
          <TableRow key={t.id} className={cn(t.status === "CANCELLED" && "opacity-50")}>
            <TableCell className="whitespace-nowrap text-xs" title={t.notes ?? undefined}>
              {formatDateTime(t.executed_at)}
            </TableCell>
            <TableCell className="font-mono text-xs">{t.symbol}</TableCell>
            <TableCell>
              <Badge variant={t.direction === "LONG" ? "success" : "destructive"}>{t.direction}</Badge>
            </TableCell>
            <TableCell className="text-right">{formatNumber(t.entry_price, 6)}</TableCell>
            <TableCell className="text-right">{formatNumber(t.stop_loss, 6)}</TableCell>
            <TableCell className="text-right">{formatNumber(t.take_profit, 6)}</TableCell>
            <TableCell className="text-right">{formatNumber(t.position_size, 4)}</TableCell>
            <TableCell className="text-right">{calculateRiskReward(t.entry_price, t.stop_loss, t.take_profit)?.toFixed(2) ?? "—"}</TableCell>
            <TableCell className="text-right">{t.exit_price === null ? "—" : formatNumber(t.exit_price, 6)}</TableCell>
            <TableCell className={cn("text-right font-medium", (t.net_pnl ?? 0) > 0 && "text-success", (t.net_pnl ?? 0) < 0 && "text-destructive")}>
              {t.net_pnl === null ? "—" : formatNumber(t.net_pnl)}
            </TableCell>
            <TableCell className="text-right">{t.r_multiple === null ? "—" : `${t.r_multiple.toFixed(2)}R`}</TableCell>
            <TableCell>
              <Badge variant={t.status === "OPEN" ? "default" : "secondary"}>{t.status}</Badge>
            </TableCell>
            <TableCell className="text-xs" title={t.fomo_check_passed ? "Checklist anti-FOMO cumprido" : "Sem checklist (registo antigo)"}>
              {t.fomo_check_passed ? "✓ " : ""}
              {t.mental_state ?? "—"}
            </TableCell>
            <TableCell>
              {t.status === "OPEN" ? (
                <div className="flex items-start gap-1">
                  <CloseForm trade={t} />
                  <form action={cancelTrade}>
                    <input type="hidden" name="id" value={t.id} />
                    <Button type="submit" variant="ghost" size="icon" aria-label="Cancelar trade" title="Cancelar (não executado)">
                      <Ban className="text-muted-foreground" />
                    </Button>
                  </form>
                </div>
              ) : t.status === "CANCELLED" ? (
                <form action={deleteTrade}>
                  <input type="hidden" name="id" value={t.id} />
                  <Button type="submit" variant="ghost" size="icon" aria-label="Apagar">
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </form>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
