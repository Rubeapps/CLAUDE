"use client";

import { Calculator, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { deleteProductIdea, saveProductIdea } from "@/app/(dashboard)/dropship/actions";
import { Button } from "@/components/ui/button";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idleState } from "@/lib/action-state";
import { calculateProduct } from "@/lib/calculations/product-calc";
import type { ProductIdea } from "@/lib/data/dropship";
import { formatCurrency, formatRatio } from "@/lib/format";
import { DEFAULT_IDEA_INPUTS, DEFAULT_SHIPPING_KEY, shippingForQuantity, type ProductIdeaInputs, type ShippingTiers } from "@/lib/product-ideas";
import { cn } from "@/lib/utils";

type Field = "unitPrice" | "unitCogs" | "cpa" | "vatPercent" | "targetMarginPercent" | "gatewayPercent" | "gatewayFixed";
type TierText = { s1: string; s2: string; s3: string };

const FIELDS: { key: Field; label: string; suffix: string }[] = [
  { key: "unitPrice", label: "Preço de venda / un.", suffix: "€" },
  { key: "unitCogs", label: "Custo do produto / un.", suffix: "€" },
  { key: "cpa", label: "CPA esperado (ads)", suffix: "€" },
  { key: "targetMarginPercent", label: "Margem desejada", suffix: "%" },
  { key: "vatPercent", label: "IVA incluído no preço", suffix: "%" },
  { key: "gatewayPercent", label: "Taxa gateway", suffix: "%" },
  { key: "gatewayFixed", label: "Taxa fixa gateway", suffix: "€" },
];

function num(value: string): number {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function optNum(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toText(inputs: ProductIdeaInputs): Record<Field, string> {
  return {
    unitPrice: String(inputs.unitPrice),
    unitCogs: String(inputs.unitCogs),
    cpa: String(inputs.cpa),
    vatPercent: String(inputs.vatPercent),
    targetMarginPercent: String(inputs.targetMarginPercent),
    gatewayPercent: String(inputs.gatewayPercent),
    gatewayFixed: String(inputs.gatewayFixed),
  };
}

function tiersToText(t: ShippingTiers | undefined): TierText {
  return { s1: t ? String(t.s1) : "", s2: t?.s2 !== null && t?.s2 !== undefined ? String(t.s2) : "", s3: t?.s3 !== null && t?.s3 !== undefined ? String(t.s3) : "" };
}

/**
 * Calculadora de produto: para qualquer produto (na loja ou só uma ideia) diz quanto ganhas,
 * quanto podes pagar em anúncios, a que preço vender e quanto podes pagar ao fornecedor,
 * com portes por país e por 1/2/3 unidades.
 */
export function ProductCalculator({ ideas, countries, currency }: { ideas: ProductIdea[]; countries: { code: string; name: string }[]; currency: string }) {
  const money = (v: number) => formatCurrency(v, currency);
  const [selectedId, setSelectedId] = useState<string>("");
  const [name, setName] = useState("Novo produto");
  const [fields, setFields] = useState<Record<Field, string>>(toText(DEFAULT_IDEA_INPUTS));
  const [shipping, setShipping] = useState<Record<string, TierText>>({ [DEFAULT_SHIPPING_KEY]: tiersToText(DEFAULT_IDEA_INPUTS.shipping[DEFAULT_SHIPPING_KEY]) });
  const [quantity, setQuantity] = useState<1 | 2 | 3>(1);
  const [state, saveAction] = useActionState(saveProductIdea, idleState);

  function load(idea: ProductIdea | null) {
    const inputs = idea?.inputs ?? DEFAULT_IDEA_INPUTS;
    setSelectedId(idea?.id ?? "");
    setName(idea?.name ?? "Novo produto");
    setFields(toText(inputs));
    const next: Record<string, TierText> = {};
    for (const [code, tiers] of Object.entries(inputs.shipping)) next[code] = tiersToText(tiers);
    if (!next[DEFAULT_SHIPPING_KEY]) next[DEFAULT_SHIPPING_KEY] = tiersToText(DEFAULT_IDEA_INPUTS.shipping[DEFAULT_SHIPPING_KEY]);
    setShipping(next);
  }

  useEffect(() => {
    if (state.status === "success" && !selectedId) {
      const saved = ideas.find((i) => i.name === name);
      if (saved) setSelectedId(saved.id);
    }
  }, [state, ideas, name, selectedId]);

  const defaultTiers: ShippingTiers = {
    s1: num(shipping[DEFAULT_SHIPPING_KEY]?.s1 ?? "0"),
    s2: optNum(shipping[DEFAULT_SHIPPING_KEY]?.s2 ?? ""),
    s3: optNum(shipping[DEFAULT_SHIPPING_KEY]?.s3 ?? ""),
  };

  function tiersFor(code: string): { tiers: ShippingTiers; own: boolean } {
    const t = shipping[code];
    if (!t || t.s1.trim() === "") return { tiers: defaultTiers, own: false };
    return { tiers: { s1: num(t.s1), s2: optNum(t.s2), s3: optNum(t.s3) }, own: true };
  }

  const base = {
    unitPrice: num(fields.unitPrice),
    unitCogs: num(fields.unitCogs),
    quantity,
    gatewayPercent: num(fields.gatewayPercent),
    gatewayFixed: num(fields.gatewayFixed),
    vatPercent: num(fields.vatPercent),
    cpa: num(fields.cpa),
    targetMarginPercent: num(fields.targetMarginPercent),
  };
  const rows = [{ code: DEFAULT_SHIPPING_KEY, name: "Padrão (outros países)" }, ...countries].map((c) => {
    const { tiers, own } = c.code === DEFAULT_SHIPPING_KEY ? { tiers: defaultTiers, own: true } : tiersFor(c.code);
    const ship = shippingForQuantity(tiers, quantity);
    return { ...c, own, ship, result: calculateProduct({ ...base, shipping: ship }) };
  });
  const main = rows[0]?.result;

  const inputsJson: ProductIdeaInputs = {
    unitPrice: base.unitPrice,
    unitCogs: base.unitCogs,
    cpa: base.cpa,
    vatPercent: Math.min(30, base.vatPercent),
    targetMarginPercent: Math.min(90, base.targetMarginPercent),
    gatewayPercent: Math.min(15, base.gatewayPercent),
    gatewayFixed: base.gatewayFixed,
    shipping: Object.fromEntries(
      Object.entries(shipping)
        .filter(([, t]) => t.s1.trim() !== "")
        .map(([code, t]) => [code, { s1: num(t.s1), s2: optNum(t.s2), s3: optNum(t.s3) }]),
    ),
  };

  function setTier(code: string, key: keyof TierText, value: string) {
    setShipping((prev) => ({ ...prev, [code]: { ...(prev[code] ?? { s1: "", s2: "", s3: "" }), [key]: value } }));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant={selectedId === "" ? "default" : "outline"} onClick={() => load(null)}>
          <Plus /> Novo produto
        </Button>
        {ideas.map((idea) => (
          <Button key={idea.id} type="button" size="sm" variant={selectedId === idea.id ? "default" : "outline"} onClick={() => load(idea)}>
            {idea.name}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="calc-name">Nome do produto</Label>
            <Input id="calc-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`calc-${f.key}`}>
                  {f.label} <span className="text-muted-foreground">({f.suffix})</span>
                </Label>
                <Input id={`calc-${f.key}`} inputMode="decimal" value={fields[f.key]} onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))} className="h-8" />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Portes totais por país (1 / 2 / 3 unidades)</p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {[{ code: DEFAULT_SHIPPING_KEY, name: "Padrão (outros países)" }, ...countries].map((c) => {
                const t = shipping[c.code] ?? { s1: "", s2: "", s3: "" };
                return (
                  <div key={c.code} className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-1.5">
                    <span className={cn("truncate text-xs", c.code === DEFAULT_SHIPPING_KEY && "font-semibold")}>
                      {c.code !== DEFAULT_SHIPPING_KEY ? <span className="font-mono text-[10px] text-muted-foreground">{c.code} </span> : null}
                      {c.name}
                    </span>
                    {(["s1", "s2", "s3"] as const).map((k, i) => (
                      <Input
                        key={k}
                        inputMode="decimal"
                        value={t[k]}
                        onChange={(e) => setTier(c.code, k, e.target.value)}
                        placeholder={c.code === DEFAULT_SHIPPING_KEY ? `${i + 1} un.` : "padrão"}
                        className="h-7 px-2 text-right text-xs"
                        aria-label={`Portes ${i + 1} un. ${c.name}`}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">Países sem valor usam o padrão. A lista de países é a mesma dos portes da loja (adiciona mais em Custos por produto).</p>
          </div>

          <form action={saveAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={selectedId} />
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="inputs" value={JSON.stringify(inputsJson)} />
            <SubmitButton size="sm" pendingLabel="A guardar…">
              {selectedId ? "Guardar alterações" : "Guardar produto"}
            </SubmitButton>
            <ActionMessage state={state} />
          </form>
          {selectedId ? (
            <form
              action={deleteProductIdea}
              onSubmit={(e) => {
                if (!window.confirm(`Apagar "${name}" da calculadora?`)) e.preventDefault();
                else load(null);
              }}
            >
              <input type="hidden" name="id" value={selectedId} />
              <Button type="submit" size="sm" variant="ghost">
                <Trash2 /> Apagar produto
              </Button>
            </form>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="inline-flex rounded-md border p-0.5" role="tablist" aria-label="Unidades por encomenda">
            {([1, 2, 3] as const).map((q) => (
              <button
                key={q}
                type="button"
                role="tab"
                aria-selected={quantity === q}
                onClick={() => setQuantity(q)}
                className={cn("rounded px-3 py-1 text-xs font-medium", quantity === q ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {q} {q === 1 ? "unidade" : "unidades"}
              </button>
            ))}
          </div>

          {main ? (
            <div className={cn("grid grid-cols-2 gap-3 rounded-lg border p-4 sm:grid-cols-3", main.profit >= 0 ? "border-success/40 bg-success/5" : "border-destructive/50 bg-destructive/5")}>
              <div>
                <p className="text-xs text-muted-foreground">Lucro por encomenda</p>
                <p className={cn("text-2xl font-semibold tabular-nums", main.profit >= 0 ? "text-success" : "text-destructive")}>{money(main.profit)}</p>
                <p className="text-xs text-muted-foreground">margem {main.marginPercent === null ? "—" : `${main.marginPercent.toFixed(1)}%`}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Máximo que podes pagar em ads</p>
                <p className="text-2xl font-semibold tabular-nums">{money(main.maxCpa)}</p>
                <p className="text-xs text-muted-foreground">break-even ROAS {formatRatio(main.breakEvenRoas)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Estás a pagar (sem ads)</p>
                <p className="text-2xl font-semibold tabular-nums">{money(main.totalCostBeforeAds)}</p>
                <p className="text-xs text-muted-foreground">
                  produto {money(main.cogs)} · portes {money(main.shipping)} · taxas {money(main.gatewayFee)}
                  {main.vat > 0 ? ` · IVA ${money(main.vat)}` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Preço p/ margem de {num(fields.targetMarginPercent)}%</p>
                <p className="text-lg font-semibold tabular-nums text-primary">{main.recommendedUnitPrice === null ? "impossível" : `${money(main.recommendedUnitPrice)} / un.`}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Máx. a pagar ao fornecedor</p>
                <p className={cn("text-lg font-semibold tabular-nums", (main.maxUnitCogs ?? 0) < base.unitCogs && "text-destructive")}>{main.maxUnitCogs === null ? "—" : `${money(main.maxUnitCogs)} / un.`}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CPA máx. p/ margem desejada</p>
                <p className={cn("text-lg font-semibold tabular-nums", main.maxCpaForTargetMargin < base.cpa && "text-destructive")}>{money(main.maxCpaForTargetMargin)}</p>
              </div>
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>País</TableHead>
                <TableHead className="text-right">Portes</TableHead>
                <TableHead className="text-right">Lucro</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead className="text-right">CPA máx.</TableHead>
                <TableHead className="text-right">BE ROAS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.code}>
                  <TableCell className="text-xs">
                    {r.name}
                    {!r.own ? <span className="text-muted-foreground"> (padrão)</span> : null}
                  </TableCell>
                  <TableCell className="text-right text-xs">{money(r.ship)}</TableCell>
                  <TableCell className={cn("text-right font-medium", r.result.profit >= 0 ? "text-success" : "text-destructive")}>{money(r.result.profit)}</TableCell>
                  <TableCell className="text-right text-xs">{r.result.marginPercent === null ? "—" : `${r.result.marginPercent.toFixed(1)}%`}</TableCell>
                  <TableCell className="text-right text-xs">{money(r.result.maxCpa)}</TableCell>
                  <TableCell className="text-right text-xs">{formatRatio(r.result.breakEvenRoas)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Calculator className="mt-0.5 h-3 w-3 shrink-0" />
            &quot;CPA máx.&quot; é o lucro antes de anúncios: o máximo que podes pagar por cliente sem perder dinheiro. O lucro e a margem já descontam o CPA esperado.
          </p>
        </div>
      </div>
    </div>
  );
}
