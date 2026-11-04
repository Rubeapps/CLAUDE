"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from "lucide-react";
import { useActionState, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { saveAdCreatives } from "@/app/(dashboard)/dropship/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idleState } from "@/lib/action-state";
import { AD_FATIGUE_FREQUENCY_THRESHOLD, AD_FATIGUE_MIN_CTR, calculateAdFatigue, type AdFatigueReason, type AdFatigueResult } from "@/lib/calculations/engine";
import type { DropshipAdCreativeRow } from "@/lib/database.types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { parseMetaAdsCsv, type MetaAdRow, type MetaColumn } from "@/lib/meta-csv";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const COLUMN_LABEL: Record<MetaColumn, string> = {
  campaignName: "Campaign Name",
  adName: "Ad Name",
  spend: "Amount Spent",
  impressions: "Impressions",
  videoPlays3s: "3-Second Video Plays",
  thruplays: "ThruPlays",
  frequency: "Frequency",
  ctr: "CTR",
  cpa: "Cost per Result",
  date: "Reporting Starts / Day",
};

const REASON_LABEL: Record<AdFatigueReason, string> = {
  FREQUENCY: `Frequência ≥ ${AD_FATIGUE_FREQUENCY_THRESHOLD}`,
  CPA_ABOVE_BREAK_EVEN_LOW_CTR: `CPA > break-even e CTR < ${AD_FATIGUE_MIN_CTR}%`,
};

interface AnalyzedRow extends MetaAdRow {
  key: string;
  fatigue: AdFatigueResult;
}

function fromSaved(row: DropshipAdCreativeRow): MetaAdRow {
  return {
    campaignName: row.campaign_name,
    adName: row.ad_name,
    spend: row.spend,
    impressions: row.impressions,
    videoPlays3s: row.video_plays_3s ?? 0,
    thruplays: row.thruplays ?? 0,
    frequency: row.frequency ?? 0,
    ctr: row.ctr ?? 0,
    cpa: row.cpa ?? 0,
    date: row.date,
  };
}

function parseInputNumber(value: string): number {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Radar de fadiga de criativos: lê o CSV exportado do Meta Ads Manager no browser,
 * calcula Hook rate, Hold rate e fadiga com calculateAdFatigue e permite guardar o histórico.
 */
export function AdFatigueRadar({ defaultBreakEvenCpa, currency, today, saved }: { defaultBreakEvenCpa: number | null; currency: string; today: string; saved: DropshipAdCreativeRow[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<MetaAdRow[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [beCpa, setBeCpa] = useState(defaultBreakEvenCpa !== null ? defaultBreakEvenCpa.toFixed(2) : "");
  const [fallbackDate, setFallbackDate] = useState(today);
  const [onlyFatigued, setOnlyFatigued] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [state, formAction] = useActionState(saveAdCreatives, idleState);

  const breakEvenCpa = parseInputNumber(beCpa);
  const source: MetaAdRow[] = rows ?? saved.map(fromSaved);
  const isSavedView = rows === null;

  const analyzed = useMemo<AnalyzedRow[]>(
    () =>
      source
        .map((r, i) => ({
          ...r,
          key: `${r.date ?? ""}|${r.campaignName}|${r.adName}|${i}`,
          fatigue: calculateAdFatigue({ impressions: r.impressions, videoPlays3s: r.videoPlays3s, thruplays: r.thruplays, frequency: r.frequency, ctr: r.ctr, cpa: r.cpa, breakEvenCpa }),
        }))
        .sort((a, b) => Number(b.fatigue.isFatigued) - Number(a.fatigue.isFatigued) || b.spend - a.spend),
    [source, breakEvenCpa],
  );

  const visible = onlyFatigued ? analyzed.filter((r) => r.fatigue.isFatigued) : analyzed;
  const fatiguedCount = analyzed.filter((r) => r.fatigue.isFatigued).length;
  const fatiguedSpend = analyzed.filter((r) => r.fatigue.isFatigued).reduce((s, r) => s + r.spend, 0);
  const totalSpend = analyzed.reduce((s, r) => s + r.spend, 0);

  async function handleFile(file: File) {
    setParseError(null);
    setWarnings([]);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setParseError("Escolhe um ficheiro .csv exportado do Meta Ads Manager.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setParseError("Ficheiro demasiado grande (máx. 5 MB).");
      return;
    }
    try {
      const result = parseMetaAdsCsv(await file.text());
      if (result.missingRequired.length > 0) {
        setParseError(`Colunas obrigatórias em falta: ${result.missingRequired.map((c) => COLUMN_LABEL[c]).join(", ")}.`);
        setRows(null);
        return;
      }
      if (result.rows.length === 0) {
        setParseError("O CSV não tem linhas de anúncios (exporta ao nível de anúncio, não de campanha).");
        setRows(null);
        return;
      }
      const notes: string[] = [];
      if (result.missingOptional.length > 0) notes.push(`Colunas em falta (assumidas a 0): ${result.missingOptional.map((c) => COLUMN_LABEL[c]).join(", ")}.`);
      if (result.skippedRows > 0) notes.push(`${result.skippedRows} linhas de totais/sem anúncio ignoradas.`);
      setWarnings(notes);
      setRows(result.rows);
      setFileName(file.name);
    } catch {
      setParseError("Não foi possível ler o ficheiro.");
    }
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function clear() {
    setRows(null);
    setFileName(null);
    setWarnings([]);
    setParseError(null);
  }

  const payload = rows ? JSON.stringify({ breakEvenCpa, fallbackDate, rows }) : "";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 text-sm transition-colors hover:bg-accent/50",
            dragging && "border-primary bg-primary/10",
          )}
        >
          <Upload className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-medium">{fileName ?? "Arrasta ou escolhe o CSV do Meta Ads"}</p>
            <p className="text-xs text-muted-foreground">Ads Manager → nível Anúncios → Exportar → CSV. EN ou PT, vírgula ou ponto e vírgula.</p>
          </div>
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onInputChange} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="be-cpa">Break-even CPA ({currency})</Label>
          <Input id="be-cpa" inputMode="decimal" value={beCpa} onChange={(e) => setBeCpa(e.target.value)} placeholder="ex.: 18.50" />
          <p className="text-xs text-muted-foreground">{defaultBreakEvenCpa !== null ? `Sugerido pelo lucro médio por encomenda: ${formatCurrency(defaultBreakEvenCpa, currency)}` : "Sem encomendas para sugerir um valor."}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fallback-date">Data (se o CSV não tiver coluna de data)</Label>
          <Input id="fallback-date" type="date" value={fallbackDate} max={today} onChange={(e) => setFallbackDate(e.target.value)} />
        </div>
      </div>

      {parseError ? (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" /> {parseError}
        </p>
      ) : null}
      {warnings.map((w) => (
        <p key={w} className="text-xs text-amber-400">
          {w}
        </p>
      ))}

      {analyzed.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">
                <FileSpreadsheet className="mr-1 h-3 w-3" />
                {isSavedView ? `Última importação guardada (${saved[0]?.date ?? "—"})` : "Pré-visualização do CSV"}
              </Badge>
              <span>
                {analyzed.length} criativos · <span className="text-destructive">{fatiguedCount} em fadiga</span> · {formatCurrency(fatiguedSpend, currency)} de{" "}
                {formatCurrency(totalSpend, currency)} gastos em criativos cansados
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={onlyFatigued} onChange={(e) => setOnlyFatigued(e.target.checked)} /> Só em fadiga
              </label>
              {!isSavedView ? (
                <>
                  <form action={formAction}>
                    <input type="hidden" name="payload" value={payload} />
                    <SubmitButton size="sm" pendingLabel="A guardar…" disabled={breakEvenCpa <= 0}>
                      Guardar no histórico
                    </SubmitButton>
                  </form>
                  <Button type="button" size="sm" variant="ghost" onClick={clear}>
                    <X /> Limpar
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          <ActionMessage state={state} />
          {breakEvenCpa <= 0 ? <p className="text-xs text-amber-400">Define o break-even CPA para avaliar a regra CPA/CTR (só a frequência está a ser avaliada).</p> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha / Anúncio</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Impr.</TableHead>
                <TableHead className="text-right" title="3s plays / impressões">
                  Hook rate
                </TableHead>
                <TableHead className="text-right" title="ThruPlays / 3s plays">
                  Hold rate
                </TableHead>
                <TableHead className="text-right">Freq.</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">CPA</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.key} className={cn(r.fatigue.isFatigued && "bg-destructive/5")}>
                  <TableCell className="max-w-[260px]">
                    <p className="truncate font-medium" title={r.adName}>
                      {r.adName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={r.campaignName}>
                      {r.campaignName}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(r.spend, currency)}</TableCell>
                  <TableCell className="text-right">{formatNumber(r.impressions, 0)}</TableCell>
                  <TableCell className={cn("text-right", r.fatigue.hookRate !== null && r.fatigue.hookRate < 20 && "text-amber-400")}>
                    {r.fatigue.hookRate === null ? "—" : `${r.fatigue.hookRate.toFixed(1)}%`}
                  </TableCell>
                  <TableCell className={cn("text-right", r.fatigue.holdRate !== null && r.fatigue.holdRate < 10 && "text-amber-400")}>
                    {r.fatigue.holdRate === null ? "—" : `${r.fatigue.holdRate.toFixed(1)}%`}
                  </TableCell>
                  <TableCell className={cn("text-right", r.frequency >= AD_FATIGUE_FREQUENCY_THRESHOLD && "font-semibold text-destructive")}>{r.frequency.toFixed(2)}</TableCell>
                  <TableCell className={cn("text-right", r.ctr < AD_FATIGUE_MIN_CTR && "text-amber-400")}>{r.ctr.toFixed(2)}%</TableCell>
                  <TableCell className={cn("text-right", breakEvenCpa > 0 && r.cpa > breakEvenCpa && "text-destructive")}>{r.cpa > 0 ? formatCurrency(r.cpa, currency) : "—"}</TableCell>
                  <TableCell>
                    {r.fatigue.isFatigued ? (
                      <div className="space-y-1">
                        <Badge variant="destructive">
                          <AlertTriangle className="mr-1 h-3 w-3" /> Fadiga Crítica / Trocar Criativo
                        </Badge>
                        <p className="text-[11px] text-muted-foreground">{r.fatigue.reasons.map((reason) => REASON_LABEL[reason]).join(" · ")}</p>
                      </div>
                    ) : (
                      <Badge variant="success">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Saudável
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : !parseError ? (
        <p className="text-xs text-muted-foreground">Ainda sem criativos. Importa um CSV para ver Hook rate, Hold rate e fadiga por anúncio.</p>
      ) : null}
    </div>
  );
}
