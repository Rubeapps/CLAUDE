"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";
import { deleteAdSpend, upsertAdSpend } from "@/app/(dashboard)/dropship/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idleState } from "@/lib/action-state";
import type { DropshipAdSpendRow } from "@/lib/database.types";
import { formatCurrency } from "@/lib/format";

export function AdSpendManager({ entries, today, currency }: { entries: DropshipAdSpendRow[]; today: string; currency: string }) {
  const [state, formAction] = useActionState(upsertAdSpend, idleState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="ad-date">Data</Label>
          <Input id="ad-date" name="date" type="date" defaultValue={today} max={today} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ad-platform">Plataforma</Label>
          <Select id="ad-platform" name="platform" defaultValue="META">
            <option value="META">Meta</option>
            <option value="TIKTOK">TikTok</option>
            <option value="GOOGLE">Google</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ad-amount">Valor</Label>
          <Input id="ad-amount" name="amount" inputMode="decimal" placeholder="120.00" required />
        </div>
        <SubmitButton pendingLabel="A guardar…">Registar</SubmitButton>
      </form>
      <ActionMessage state={state} />

      {entries.length > 0 ? (
        <div className="max-h-72 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.date}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{e.platform}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(e.amount, currency)}</TableCell>
                  <TableCell>
                    <form action={deleteAdSpend}>
                      <input type="hidden" name="id" value={e.id} />
                      <Button type="submit" variant="ghost" size="icon" aria-label="Apagar registo">
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
