"use client";

import { ChevronDown, Globe2, Package } from "lucide-react";
import { useActionState, useState } from "react";
import { saveCountryRates, updateProductGroupCosts } from "@/app/(dashboard)/dropship/actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idleState } from "@/lib/action-state";
import { calculateTieredShipping } from "@/lib/calculations/unit-economics";
import type { ShippingConfig } from "@/lib/data/dropship";
import type { DropshipProductRow } from "@/lib/database.types";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ProductGroup {
  name: string;
  skus: string[];
  cogs: number;
  shipping1: number;
  shipping2: number;
  shipping3: number;
  /** true se as variantes do produto não têm todas o mesmo custo. */
  mixed: boolean;
}

const QUANTITIES = [1, 2, 3] as const;

function groupProducts(products: DropshipProductRow[]): ProductGroup[] {
  const groups = new Map<string, DropshipProductRow[]>();
  for (const p of products) groups.set(p.name, [...(groups.get(p.name) ?? []), p]);
  return [...groups.entries()]
    .map(([name, rows]) => {
      const first = rows[0];
      const tiers = { shipping_cost: first?.shipping_cost ?? 0, shipping_cost_2: first?.shipping_cost_2 ?? null, shipping_cost_3: first?.shipping_cost_3 ?? null };
      return {
        name,
        skus: rows.map((r) => r.sku),
        cogs: first?.cogs ?? 0,
        shipping1: calculateTieredShipping(1, tiers),
        shipping2: calculateTieredShipping(2, tiers),
        shipping3: calculateTieredShipping(3, tiers),
        mixed: rows.some(
          (r) => r.cogs !== first?.cogs || r.shipping_cost !== first?.shipping_cost || r.shipping_cost_2 !== first?.shipping_cost_2 || r.shipping_cost_3 !== first?.shipping_cost_3,
        ),
      };
    })
    .sort((a, b) => b.skus.length - a.skus.length || a.name.localeCompare(b.name));
}

function parse(value: string): number {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function MoneyInput({ form, name, value, onChange, label }: { form: string; name: string; value: string; onChange: (v: string) => void; label: string }) {
  return <Input form={form} name={name} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-20 text-right" aria-label={label} />;
}

type CountryRates = Record<string, { s1: number; s2: number | null; s3: number | null }>;

function CountryRatesForm({ group, countries, rates, currency }: { group: ProductGroup; countries: ShippingConfig["countries"]; rates: CountryRates; currency: string }) {
  const [state, action] = useActionState(saveCountryRates, idleState);
  if (countries.length === 0) {
    return <p className="text-xs text-muted-foreground">Adiciona países de entrega em cima para definires portes diferentes por país.</p>;
  }
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="product_name" value={group.name} />
      <p className="text-xs text-muted-foreground">
        Deixa vazio para usar os portes por defeito ({formatCurrency(group.shipping1, currency)} / {formatCurrency(group.shipping2, currency)} /{" "}
        {formatCurrency(group.shipping3, currency)}).
      </p>
      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {countries.map((c) => {
          const r = rates[c.code];
          return (
            <div key={c.code} className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-1.5">
              <span className={cn("truncate text-xs", r ? "font-medium" : "text-muted-foreground")} title={c.name}>
                <span className="font-mono text-[10px] text-muted-foreground">{c.code}</span> {c.name}
              </span>
              {([1, 2, 3] as const).map((q) => (
                <Input
                  key={q}
                  name={`rate_${c.code}_${q}`}
                  inputMode="decimal"
                  defaultValue={r ? (q === 1 ? r.s1 : q === 2 ? (r.s2 ?? "") : (r.s3 ?? "")) : ""}
                  placeholder={`${q} un.`}
                  className="h-7 px-2 text-right text-xs"
                  aria-label={`Portes ${q} un. ${c.name}`}
                />
              ))}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <SubmitButton size="sm" pendingLabel="A guardar…">
          Guardar portes por país
        </SubmitButton>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function GroupRow({
  group,
  currency,
  index,
  countries,
  rates,
}: {
  group: ProductGroup;
  currency: string;
  index: number;
  countries: ShippingConfig["countries"];
  rates: CountryRates;
}) {
  const [showCountries, setShowCountries] = useState(false);
  const definedCountries = countries.filter((c) => rates[c.code]).length;
  const [state, action] = useActionState(updateProductGroupCosts, idleState);
  const [cogs, setCogs] = useState(group.cogs.toFixed(2));
  const [s1, setS1] = useState(group.shipping1.toFixed(2));
  const [s2, setS2] = useState(group.shipping2.toFixed(2));
  const [s3, setS3] = useState(group.shipping3.toFixed(2));
  const formId = `product-cost-${index}`;
  const unset = group.cogs === 0 && group.shipping1 === 0;
  const shippingByQty = [parse(s1), parse(s2), parse(s3)];
  const tiersInvalid = shippingByQty[1]! < shippingByQty[0]! || shippingByQty[2]! < shippingByQty[1]!;

  return (
    <>
      <TableRow className="align-top">
        <TableCell className="min-w-[200px]">
          <p className="font-medium">{group.name}</p>
          <p className="text-xs text-muted-foreground">
            {group.skus.length} {group.skus.length === 1 ? "variante" : "variantes"}
            {group.mixed ? " · custos diferentes entre variantes" : ""}
          </p>
          {unset ? (
            <Badge variant="destructive" className="mt-1">
              custo por preencher
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={() => setShowCountries(!showCountries)}
            className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
            aria-expanded={showCountries}
          >
            <Globe2 className="h-3 w-3" /> Portes por país ({definedCountries}/{countries.length})
            <ChevronDown className={cn("h-3 w-3 transition-transform", showCountries && "rotate-180")} />
          </button>
        </TableCell>
        <TableCell>
          <MoneyInput form={formId} name="cogs" value={cogs} onChange={setCogs} label={`COGS por unidade de ${group.name}`} />
        </TableCell>
        <TableCell>
          <MoneyInput form={formId} name="shipping_cost" value={s1} onChange={setS1} label={`Portes para 1 unidade de ${group.name}`} />
        </TableCell>
        <TableCell>
          <MoneyInput form={formId} name="shipping_cost_2" value={s2} onChange={setS2} label={`Portes para 2 unidades de ${group.name}`} />
        </TableCell>
        <TableCell>
          <MoneyInput form={formId} name="shipping_cost_3" value={s3} onChange={setS3} label={`Portes para 3 unidades de ${group.name}`} />
        </TableCell>
        <TableCell className="text-xs tabular-nums">
          {QUANTITIES.map((q, i) => (
            <p key={q} className="whitespace-nowrap">
              <span className="text-muted-foreground">{q} un.:</span> <span className="font-medium">{formatCurrency(parse(cogs) * q + (shippingByQty[i] ?? 0), currency)}</span>
            </p>
          ))}
        </TableCell>
        <TableCell>
          <form id={formId} action={action} className="space-y-1">
            <input type="hidden" name="name" value={group.name} />
            <SubmitButton size="sm" pendingLabel="A guardar…" disabled={tiersInvalid}>
              Guardar
            </SubmitButton>
            {tiersInvalid ? <p className="text-xs text-destructive">Portes de 2/3 un. não podem ser menores.</p> : null}
            <ActionMessage state={state} />
          </form>
        </TableCell>
      </TableRow>
      {showCountries ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={7} className="bg-muted/20">
            <CountryRatesForm group={group} countries={countries} rates={rates} currency={currency} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/**
 * Custos por produto: COGS por unidade e portes totais por escalão (1, 2 e 3 unidades do mesmo produto),
 * aplicados a todas as variantes. Acima de 3 unidades soma-se o incremento entre o escalão de 3 e o de 2.
 */
export function ProductCostsTable({ products, currency, shipping }: { products: DropshipProductRow[]; currency: string; shipping: ShippingConfig }) {
  const groups = groupProducts(products);
  if (groups.length === 0) {
    return <EmptyState icon={Package} title="Sem produtos" description="Adiciona os SKUs da tua loja na secção avançada abaixo." />;
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Produto</TableHead>
            <TableHead>COGS / un.</TableHead>
            <TableHead>Portes padrão 1 un.</TableHead>
            <TableHead>Portes padrão 2 un.</TableHead>
            <TableHead>Portes padrão 3 un.</TableHead>
            <TableHead>Custo da encomenda</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g, i) => (
            <GroupRow key={g.name} group={g} currency={currency} index={i} countries={shipping.countries} rates={shipping.rates[g.name] ?? {}} />
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Os portes são o valor total do envio para essa quantidade do mesmo produto (variantes diferentes contam juntas). Acima de 3 unidades, cada unidade extra soma a diferença
        entre &quot;3 un.&quot; e &quot;2 un.&quot;.
      </p>
    </div>
  );
}
