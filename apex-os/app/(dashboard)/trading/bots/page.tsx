import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { BotsManager, type BotLogView, type BotView } from "@/components/trading/BotsManager";
import { buttonVariants } from "@/components/ui/button";
import { getSiteUrl } from "@/lib/site-url";
import { requireUser } from "@/lib/supabase/server";
import { isVaultConfigured } from "@/lib/trading/crypto-vault";

export const metadata: Metadata = { title: "Trading Bots" };

export default async function TradingBotsPage() {
  const { supabase, user } = await requireUser();
  const [botsRes, accountsRes, siteUrl] = await Promise.all([
    supabase.from("trading_bots").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
    supabase.from("trading_accounts").select("id, name").eq("user_id", user.id).order("created_at", { ascending: true }),
    getSiteUrl(),
  ]);
  if (botsRes.error) throw new Error(botsRes.error.message);
  if (accountsRes.error) throw new Error(accountsRes.error.message);

  const accountName = new Map(accountsRes.data.map((a) => [a.id, a.name]));
  // As chaves encriptadas nunca saem do servidor: o cliente só recebe "tem chaves / não tem".
  const bots: BotView[] = botsRes.data.map((b) => ({
    id: b.id,
    name: b.name,
    accountName: accountName.get(b.account_id) ?? "—",
    symbol: b.symbol,
    isActive: b.is_active,
    isTestnet: b.is_testnet,
    riskPercent: Number(b.risk_per_trade_percent),
    webhookSecret: b.webhook_secret,
    hasKeys: Boolean(b.api_key_encrypted && b.api_secret_encrypted),
  }));

  let logs: BotLogView[] = [];
  if (bots.length > 0) {
    const botName = new Map(bots.map((b) => [b.id, b.name]));
    const { data, error } = await supabase
      .from("trading_bot_logs")
      .select("id, bot_id, event_type, message, created_at")
      .in(
        "bot_id",
        bots.map((b) => b.id),
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    logs = data.map((l) => ({ id: l.id, botName: botName.get(l.bot_id) ?? "—", eventType: l.event_type, message: l.message, createdAt: l.created_at }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trading Bots"
        description="Executa sinais do TradingView na Binance Spot com dimensionamento por risco, circuit breaker diário e OCO de proteção."
        actions={
          <Link href="/trading" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Voltar ao Trading
          </Link>
        }
      />
      <BotsManager bots={bots} logs={logs} accounts={accountsRes.data} webhookUrl={`${siteUrl}/api/trading/bot/webhook`} vaultConfigured={isVaultConfigured()} />
    </div>
  );
}
