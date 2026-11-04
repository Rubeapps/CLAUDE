"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { createAccount, deleteAccount, updateAccount } from "@/app/(dashboard)/trading/actions";
import { Button } from "@/components/ui/button";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/action-state";
import type { TradingAccountRow } from "@/lib/database.types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function AccountFields({ account }: { account?: TradingAccountRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      <div className="space-y-1">
        <Label>Nome</Label>
        <Input name="name" defaultValue={account?.name} placeholder="Prop firm 100k" required />
      </div>
      <div className="space-y-1">
        <Label>Saldo</Label>
        <Input name="balance" inputMode="decimal" defaultValue={account?.balance} placeholder="10000" required />
      </div>
      <div className="space-y-1">
        <Label>Moeda</Label>
        <Input name="currency" defaultValue={account?.currency ?? "USD"} required />
      </div>
      <div className="space-y-1">
        <Label>Risco máx. %</Label>
        <Input name="max_risk_percent" inputMode="decimal" defaultValue={account?.max_risk_percent ?? 1} required />
      </div>
      <div className="space-y-1">
        <Label>Perda diária máx. %</Label>
        <Input name="max_daily_loss_percent" inputMode="decimal" defaultValue={account?.max_daily_loss_percent ?? 3} required />
      </div>
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [state, action] = useActionState(createAccount, idleState);
  return (
    <form action={action} className="space-y-3 rounded-md border p-3">
      <AccountFields />
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingLabel="A criar…">
          Criar conta
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Fechar
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

function EditForm({ account, onDone }: { account: TradingAccountRow; onDone: () => void }) {
  const [state, action] = useActionState(updateAccount, idleState);
  return (
    <form action={action} className="space-y-3 rounded-md border p-3">
      <input type="hidden" name="id" value={account.id} />
      <AccountFields account={account} />
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingLabel="A guardar…">
          Guardar
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Fechar
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function AccountsManager({ accounts, selectedId }: { accounts: TradingAccountRow[]; selectedId: string | null }) {
  const [mode, setMode] = useState<"none" | "create" | "edit">(accounts.length === 0 ? "create" : "none");
  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={`/trading?account=${a.id}`}
            className={cn("rounded-md border px-3 py-1.5 text-sm", a.id === selectedId ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            {a.name} <span className="font-mono text-xs tabular-nums">{formatNumber(a.balance)} {a.currency}</span>
          </Link>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => setMode(mode === "create" ? "none" : "create")}>
          <Plus /> Conta
        </Button>
        {selected ? (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode(mode === "edit" ? "none" : "edit")}>
              <Pencil /> Editar
            </Button>
            <form
              action={deleteAccount}
              onSubmit={(e) => {
                if (!window.confirm(`Apagar a conta ${selected.name} e todo o diário associado?`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={selected.id} />
              <Button type="submit" size="sm" variant="ghost">
                <Trash2 /> Apagar
              </Button>
            </form>
          </>
        ) : null}
      </div>
      {mode === "create" ? <CreateForm onDone={() => setMode("none")} /> : null}
      {mode === "edit" && selected ? <EditForm key={selected.id} account={selected} onDone={() => setMode("none")} /> : null}
    </div>
  );
}
