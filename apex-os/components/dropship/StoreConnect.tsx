"use client";

import { Check, Copy, Unplug } from "lucide-react";
import { useActionState, useState } from "react";
import { connectStore, disconnectStore } from "@/app/(dashboard)/dropship/actions";
import { Button } from "@/components/ui/button";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { idleState } from "@/lib/action-state";
import type { DropshipStoreRow } from "@/lib/database.types";

export function StoreConnect({ stores, webhookUrl }: { stores: DropshipStoreRow[]; webhookUrl: string }) {
  const [state, formAction] = useActionState(connectStore, idleState);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
        <li>Liga aqui o domínio myshopify da tua loja.</li>
        <li>
          No Shopify: <span className="text-foreground">Settings → Notifications → Webhooks → Create webhook</span>, eventos <code>Order creation</code>, <code>Order update</code> e{" "}
          <code>Order cancellation</code>, formato JSON.
        </li>
        <li>
          Copia a chave de assinatura mostrada pelo Shopify para <code>SHOPIFY_WEBHOOK_SECRET</code>.
        </li>
      </ol>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-xs">{webhookUrl}</code>
        <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copiar URL do webhook">
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <form action={formAction} className="flex gap-2">
        <Input name="shop_domain" placeholder="a-minha-loja.myshopify.com" required />
        <SubmitButton pendingLabel="A ligar…">Ligar</SubmitButton>
      </form>
      <ActionMessage state={state} />
      {stores.length > 0 ? (
        <ul className="space-y-1">
          {stores.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-md border px-3 py-1.5">
              <span className="font-mono text-xs">{s.shop_domain}</span>
              <form action={disconnectStore}>
                <input type="hidden" name="id" value={s.id} />
                <Button type="submit" variant="ghost" size="sm">
                  <Unplug /> Desligar
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
