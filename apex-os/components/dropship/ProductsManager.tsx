"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";
import { deleteProduct, upsertProduct } from "@/app/(dashboard)/dropship/actions";
import { Button } from "@/components/ui/button";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idleState } from "@/lib/action-state";
import type { DropshipProductRow } from "@/lib/database.types";
import { formatCurrency } from "@/lib/format";

export function ProductsManager({ products, currency }: { products: DropshipProductRow[]; currency: string }) {
  const [state, formAction] = useActionState(upsertProduct, idleState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_1.5fr_0.8fr_0.8fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" name="sku" placeholder="LED-STRIP-5M" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" placeholder="Fita LED 5m" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cogs">COGS / un.</Label>
          <Input id="cogs" name="cogs" inputMode="decimal" placeholder="4.20" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="shipping_cost">Portes / un.</Label>
          <Input id="shipping_cost" name="shipping_cost" inputMode="decimal" placeholder="2.90" required />
        </div>
        <SubmitButton pendingLabel="A guardar…">Guardar</SubmitButton>
      </form>
      <ActionMessage state={state} />
      <p className="text-xs text-muted-foreground">Guardar um SKU existente atualiza os custos. Encomendas futuras (e atualizações via webhook) usam os novos valores.</p>

      {products.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="text-right">COGS</TableHead>
              <TableHead className="text-right">Portes</TableHead>
              <TableHead className="text-right">Custo total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell className="text-right">{formatCurrency(p.cogs, currency)}</TableCell>
                <TableCell className="text-right">{formatCurrency(p.shipping_cost, currency)}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(p.cogs + p.shipping_cost, currency)}</TableCell>
                <TableCell>
                  <form action={deleteProduct}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" variant="ghost" size="icon" aria-label={`Apagar ${p.sku}`}>
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
