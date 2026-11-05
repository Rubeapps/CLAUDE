"use client";

import { Globe2, X } from "lucide-react";
import { useActionState, useState } from "react";
import { addShippingCountry, removeShippingCountry } from "@/app/(dashboard)/dropship/actions";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input, Select } from "@/components/ui/input";
import { idleState } from "@/lib/action-state";
import { COUNTRY_CATALOG } from "@/lib/countries";

/** Lista de países de entrega: adicionar (catálogo ou código livre) e remover. */
export function ShippingCountriesManager({ countries }: { countries: { code: string; name: string }[] }) {
  const [state, action] = useActionState(addShippingCountry, idleState);
  const [custom, setCustom] = useState(false);
  const available = COUNTRY_CATALOG.filter((c) => !countries.some((x) => x.code === c.code));

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Globe2 className="h-4 w-4 text-primary" /> Países de entrega ({countries.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {countries.map((c) => (
          <form key={c.code} action={removeShippingCountry} className="inline-flex">
            <input type="hidden" name="country_code" value={c.code} />
            <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pl-2 pr-1 text-xs">
              <span className="font-mono text-[10px] text-muted-foreground">{c.code}</span> {c.name}
              <button
                type="submit"
                aria-label={`Remover ${c.name}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                onClick={(e) => {
                  if (!window.confirm(`Remover ${c.name}? Os portes definidos para este país são apagados.`)) e.preventDefault();
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </form>
        ))}
        {countries.length === 0 ? <span className="text-xs text-muted-foreground">Sem países: todos usam os portes por defeito.</span> : null}
      </div>
      <form action={action} className="flex flex-wrap items-center gap-2">
        {custom ? (
          <>
            <Input name="country_code" placeholder="Código (ex.: MA)" maxLength={2} className="h-8 w-28 uppercase" required />
            <Input name="name" placeholder="Nome do país" className="h-8 w-44" required />
          </>
        ) : (
          <Select name="country_code" className="h-8 w-56" defaultValue={available[0]?.code ?? ""} required>
            {available.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </Select>
        )}
        <SubmitButton size="sm" pendingLabel="…">
          Adicionar país
        </SubmitButton>
        <button type="button" onClick={() => setCustom(!custom)} className="text-xs text-muted-foreground hover:text-foreground">
          {custom ? "Escolher da lista" : "Outro país (código manual)"}
        </button>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}
