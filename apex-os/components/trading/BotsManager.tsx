"use client";

import { Bot, Check, Copy, Eye, EyeOff, KeyRound, Pause, Play, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { createBot, deleteBot, rotateBotSecret, setBotLive, setBotTestnet, toggleBot, updateBotKeys } from "@/app/(dashboard)/trading/bots/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionMessage, SubmitButton } from "@/components/ui/form-status";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idleState } from "@/lib/action-state";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BotView {
  id: string;
  name: string;
  accountName: string;
  symbol: string;
  isActive: boolean;
  isTestnet: boolean;
  riskPercent: number;
  webhookSecret: string;
  hasKeys: boolean;
}

export interface BotLogView {
  id: string;
  botName: string;
  eventType: string;
  message: string;
  createdAt: string | null;
}

function useCopy(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  return [
    copied,
    (key, text) => {
      void navigator.clipboard.writeText(text).then(
        () => {
          setCopied(key);
          setTimeout(() => setCopied(null), 1500);
        },
        () => setCopied(null),
      );
    },
  ];
}

function CreateBotForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createBot, idleState);
  if (accounts.length === 0) return <p className="text-sm text-muted-foreground">Cria primeiro uma conta de trading na página Trading.</p>;
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="bot-name">Nome</Label>
          <Input id="bot-name" name="name" placeholder="BTC breakout H1" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bot-account">Conta</Label>
          <Select id="bot-account" name="account_id" defaultValue={accounts[0]?.id}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="bot-symbol">Símbolo</Label>
          <Input id="bot-symbol" name="symbol" defaultValue="BTCUSDT" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bot-risk">Risco por trade %</Label>
          <Input id="bot-risk" name="risk_per_trade_percent" inputMode="decimal" defaultValue="1" required />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="bot-key">API Key da Binance Testnet (opcional agora)</Label>
          <Input id="bot-key" name="api_key" autoComplete="off" spellCheck={false} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bot-secret">API Secret</Label>
          <Input id="bot-secret" name="api_secret" type="password" autoComplete="off" spellCheck={false} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        O bot nasce em <strong>testnet</strong> (fundos fictícios, chaves de testnet.binance.vision) e <strong>desativado</strong>. As chaves são encriptadas (AES-256-GCM) antes de
        serem guardadas e nunca voltam ao browser. Na Binance, dá à chave só permissão de <em>Spot Trading</em>, nunca de levantamentos.
      </p>
      <SubmitButton pendingLabel="A criar…">
        <Bot /> Criar bot
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

function KeysForm({ bot }: { bot: BotView }) {
  const [state, action] = useActionState(updateBotKeys, idleState);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="id" value={bot.id} />
      <Input name="api_key" placeholder="API Key" autoComplete="off" spellCheck={false} className="h-8 text-xs" aria-label="API Key" />
      <Input name="api_secret" type="password" placeholder="API Secret" autoComplete="off" spellCheck={false} className="h-8 text-xs" aria-label="API Secret" />
      <SubmitButton size="sm" pendingLabel="A guardar…">
        <KeyRound /> Guardar chaves
      </SubmitButton>
      <div className="sm:col-span-3">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function LiveForm({ bot }: { bot: BotView }) {
  const [state, action] = useActionState(setBotLive, idleState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
      <input type="hidden" name="id" value={bot.id} />
      <ShieldAlert className="h-4 w-4 text-destructive" />
      <span className="text-xs">Passar para dinheiro real: escreve</span>
      <code className="text-xs">LIVE</code>
      <Input name="confirm" className="h-8 w-20 text-xs" aria-label="Confirmação LIVE" autoComplete="off" />
      <SubmitButton size="sm" variant="destructive" pendingLabel="…">
        Ativar modo real
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

function BotCard({ bot, webhookUrl }: { bot: BotView; webhookUrl: string }) {
  const [showSecret, setShowSecret] = useState(false);
  const [showKeys, setShowKeys] = useState(!bot.hasKeys);
  const [copied, copy] = useCopy();
  const template = JSON.stringify({ secret: bot.webhookSecret, action: "BUY", symbol: bot.symbol, entryPrice: "{{close}}", stopLoss: 0, takeProfit: 0 }, null, 2);

  return (
    <div className={cn("space-y-3 rounded-lg border p-4", bot.isActive && (bot.isTestnet ? "border-primary/40" : "border-destructive/50"))}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{bot.name}</p>
            <Badge variant={bot.isActive ? "success" : "secondary"}>{bot.isActive ? "ativo" : "desativado"}</Badge>
            <Badge variant={bot.isTestnet ? "default" : "destructive"}>{bot.isTestnet ? "TESTNET" : "REAL"}</Badge>
            {!bot.hasKeys ? <Badge variant="destructive">sem chaves</Badge> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {bot.symbol} · conta {bot.accountName} · risco {bot.riskPercent}% por trade · sinais via webhook
          </p>
        </div>
        <div className="flex items-center gap-1">
          <form action={toggleBot}>
            <input type="hidden" name="id" value={bot.id} />
            <Button type="submit" size="sm" variant={bot.isActive ? "outline" : "success"} disabled={!bot.hasKeys && !bot.isActive}>
              {bot.isActive ? <Pause /> : <Play />} {bot.isActive ? "Pausar" : "Ativar"}
            </Button>
          </form>
          <form
            action={deleteBot}
            onSubmit={(e) => {
              if (!window.confirm(`Apagar o bot ${bot.name} e os seus logs? Os trades do diário mantêm-se.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={bot.id} />
            <Button type="submit" size="icon" variant="ghost" aria-label="Apagar bot">
              <Trash2 className="text-muted-foreground" />
            </Button>
          </form>
        </div>
      </div>

      <div className="space-y-2 rounded-md bg-muted/40 p-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-muted-foreground">Webhook URL</span>
          <code className="flex-1 truncate font-mono">{webhookUrl}</code>
          <Button type="button" size="icon" variant="ghost" onClick={() => copy("url", webhookUrl)} aria-label="Copiar URL">
            {copied === "url" ? <Check /> : <Copy />}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-muted-foreground">X-Bot-Secret</span>
          <code className="flex-1 truncate font-mono">{showSecret ? bot.webhookSecret : "•".repeat(24)}</code>
          <Button type="button" size="icon" variant="ghost" onClick={() => setShowSecret(!showSecret)} aria-label={showSecret ? "Esconder segredo" : "Mostrar segredo"}>
            {showSecret ? <EyeOff /> : <Eye />}
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={() => copy("secret", bot.webhookSecret)} aria-label="Copiar segredo">
            {copied === "secret" ? <Check /> : <Copy />}
          </Button>
          <form
            action={rotateBotSecret}
            onSubmit={(e) => {
              if (!window.confirm("Gerar um segredo novo? Os alertas do TradingView com o segredo antigo deixam de funcionar.")) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={bot.id} />
            <Button type="submit" size="icon" variant="ghost" aria-label="Gerar segredo novo">
              <RefreshCw />
            </Button>
          </form>
        </div>
        <details>
          <summary className="cursor-pointer text-muted-foreground">Mensagem para o alerta do TradingView</summary>
          <pre className="mt-2 overflow-x-auto rounded bg-background p-2 font-mono text-[11px]">{template}</pre>
          <p className="mt-1 text-muted-foreground">
            Substitui stopLoss e takeProfit (ou usa placeholders do teu indicador). Para fechar a posição envia <code>&quot;action&quot;: &quot;SELL&quot;</code>.
          </p>
          <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => copy("tpl", template)}>
            {copied === "tpl" ? <Check /> : <Copy />} Copiar mensagem
          </Button>
        </details>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setShowKeys(!showKeys)}>
          <KeyRound /> {bot.hasKeys ? "Substituir chaves" : "Adicionar chaves"}
        </Button>
        {!bot.isTestnet ? (
          <form action={setBotTestnet}>
            <input type="hidden" name="id" value={bot.id} />
            <Button type="submit" size="sm" variant="outline">
              Voltar a testnet
            </Button>
          </form>
        ) : null}
      </div>
      {showKeys ? <KeysForm bot={bot} /> : null}
      {bot.isTestnet ? <LiveForm bot={bot} /> : null}
    </div>
  );
}

const EVENT_STYLE: Record<string, "success" | "destructive" | "secondary" | "default"> = {
  ORDER_EXECUTED: "success",
  ERROR: "destructive",
  CIRCUIT_BREAKER_BLOCKED: "destructive",
  SIGNAL_REJECTED: "secondary",
  SIGNAL_RECEIVED: "default",
};

export function BotsManager({ bots, logs, accounts, webhookUrl, vaultConfigured }: { bots: BotView[]; logs: BotLogView[]; accounts: { id: string; name: string }[]; webhookUrl: string; vaultConfigured: boolean }) {
  return (
    <div className="space-y-6">
      {!vaultConfigured ? (
        <p className="rounded-md border border-amber-400/50 bg-amber-400/10 p-2 text-xs text-amber-300">
          <code>BOT_ENCRYPTION_KEY</code> não está configurada no servidor: não é possível guardar chaves da Binance.
        </p>
      ) : null}
      <div className="rounded-lg border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Novo bot (sinais via webhook)</p>
        <CreateBotForm accounts={accounts} />
      </div>

      {bots.length === 0 ? (
        <EmptyState icon={Bot} title="Sem bots" description="Cria um bot, liga as chaves da Binance Testnet e aponta um alerta do TradingView para o webhook." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {bots.map((b) => (
            <BotCard key={b.id} bot={b} webhookUrl={webhookUrl} />
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Logs recentes</p>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ainda não chegou nenhum sinal.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Bot</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Mensagem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(l.createdAt)}</TableCell>
                  <TableCell className="text-xs">{l.botName}</TableCell>
                  <TableCell>
                    <Badge variant={EVENT_STYLE[l.eventType] ?? "secondary"}>{l.eventType}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{l.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
