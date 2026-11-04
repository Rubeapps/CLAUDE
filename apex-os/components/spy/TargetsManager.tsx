"use client";

import { ExternalLink, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { addTarget, deleteTarget, scanNow, toggleTarget } from "@/app/(dashboard)/spy/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/action-state";
import type { SpyTargetWithStats } from "@/lib/data/spy";
import { formatDateTime } from "@/lib/format";

function TargetRow({ target }: { target: SpyTargetWithStats }) {
  const [state, scanAction] = useActionState(scanNow, idleState);

  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{target.store_name}</p>
            <Badge variant={target.is_active ? "success" : "secondary"}>{target.is_active ? "ativa" : "pausada"}</Badge>
          </div>
          <a href={target.store_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {target.store_url.replace(/^https:\/\//, "")} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex items-center gap-1">
          <form action={scanAction}>
            <input type="hidden" name="id" value={target.id} />
            <SubmitButton variant="outline" size="sm" pendingLabel="A ler…">
              <RefreshCw /> Scan
            </SubmitButton>
          </form>
          <form action={toggleTarget}>
            <input type="hidden" name="id" value={target.id} />
            <Button type="submit" variant="ghost" size="icon" aria-label={target.is_active ? "Pausar" : "Retomar"}>
              {target.is_active ? <Pause /> : <Play />}
            </Button>
          </form>
          <form
            action={deleteTarget}
            onSubmit={(e) => {
              if (!window.confirm(`Apagar ${target.store_name} e todo o histórico?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={target.id} />
            <Button type="submit" variant="ghost" size="icon" aria-label="Apagar">
              <Trash2 className="text-muted-foreground" />
            </Button>
          </form>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {target.productCount} produtos · {target.outOfStock} sem stock · último scan {formatDateTime(target.last_scraped_at)}
      </p>
      <ActionMessage state={state} />
    </li>
  );
}

export function TargetsManager({ targets }: { targets: SpyTargetWithStats[] }) {
  const [state, formAction] = useActionState(addTarget, idleState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="store_name">Nome</Label>
            <Input id="store_name" name="store_name" placeholder="Concorrente X" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="store_url">URL da loja</Label>
            <Input id="store_url" name="store_url" placeholder="loja-concorrente.com" required />
          </div>
        </div>
        <SubmitButton className="w-full" pendingLabel="A validar loja…">
          Adicionar loja
        </SubmitButton>
        <ActionMessage state={state} />
      </form>
      {targets.length > 0 ? (
        <ul className="space-y-2">
          {targets.map((t) => (
            <TargetRow key={t.id} target={t} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Ainda não monitorizas nenhuma loja.</p>
      )}
    </div>
  );
}
