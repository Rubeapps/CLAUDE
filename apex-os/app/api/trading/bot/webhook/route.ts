import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { calculatePositionSize } from "@/lib/calculations/engine";
import { calculateRMultiple, calculateTradePnl } from "@/lib/calculations/risk";
import type { BotEventType, Json, TradingBotRow } from "@/lib/database.types";
import { getCircuitState, normalizeAccount } from "@/lib/data/trading";
import { errorMessage, jsonError } from "@/lib/http";
import { createServiceClient, type TypedSupabaseClient } from "@/lib/supabase/server";
import { isTelegramConfigured, sendTelegramAlert } from "@/lib/telegram";
import {
  BinanceApiError,
  cancelOpenOrders,
  executeBinanceOrder,
  floorToStep,
  getFreeBalance,
  getSymbolFilters,
  placeProtectiveOco,
  type BinanceCredentials,
} from "@/lib/trading/binance-signer";
import { decryptSecret, isVaultConfigured } from "@/lib/trading/crypto-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const positive = z.coerce.number().positive();

/**
 * Sinal (ex.: alerta do TradingView). O segredo pode vir no header X-Bot-Secret
 * ou no campo "secret" do JSON (o TradingView não permite headers personalizados).
 */
const signalSchema = z
  .object({
    action: z.enum(["BUY", "SELL"]),
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{5,20}$/, "símbolo inválido"),
    entryPrice: positive.optional(),
    stopLoss: positive.optional(),
    takeProfit: positive.optional(),
    secret: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action !== "BUY") return;
    if (v.entryPrice === undefined || v.stopLoss === undefined || v.takeProfit === undefined) {
      ctx.addIssue({ code: "custom", message: "Sinais BUY precisam de entryPrice, stopLoss e takeProfit." });
      return;
    }
    if (!(v.stopLoss < v.entryPrice)) ctx.addIssue({ code: "custom", path: ["stopLoss"], message: "Num BUY o stopLoss tem de ficar abaixo do entryPrice." });
    if (!(v.takeProfit > v.entryPrice)) ctx.addIssue({ code: "custom", path: ["takeProfit"], message: "Num BUY o takeProfit tem de ficar acima do entryPrice." });
  });

type Signal = z.infer<typeof signalSchema>;

interface WebhookResultBody {
  ok: boolean;
  event: BotEventType;
  message: string;
  details?: Record<string, string | number | boolean | null>;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function botTag(botId: string): string {
  return `[BOT:${botId}]`;
}

async function log(supabase: TypedSupabaseClient, botId: string, event: BotEventType, message: string, payload: Json | null = null): Promise<void> {
  const { error } = await supabase.from("trading_bot_logs").insert({ bot_id: botId, event_type: event, message, payload });
  if (error) console.error(`[bot ${botId}] falha ao gravar log: ${error.message}`);
}

async function notify(message: string, severity: "TRADING" | "CIRCUIT BREAKER" = "TRADING"): Promise<void> {
  if (isTelegramConfigured()) await sendTelegramAlert(message, severity);
}

function respond(status: 200 | 400 | 403 | 409 | 422 | 502, body: WebhookResultBody) {
  return NextResponse.json(body, { status });
}

/** Registo seguro do sinal (sem o segredo). */
function signalPayload(signal: Signal): Json {
  return { action: signal.action, symbol: signal.symbol, entryPrice: signal.entryPrice ?? null, stopLoss: signal.stopLoss ?? null, takeProfit: signal.takeProfit ?? null };
}

async function handleBuy(supabase: TypedSupabaseClient, bot: TradingBotRow, creds: BinanceCredentials, signal: Signal & { entryPrice: number; stopLoss: number; takeProfit: number }) {
  const { data: accountRow, error: accountError } = await supabase.from("trading_accounts").select("*").eq("id", bot.account_id).eq("user_id", bot.user_id).maybeSingle();
  if (accountError) throw new Error(accountError.message);
  if (!accountRow) {
    await log(supabase, bot.id, "ERROR", "Conta de trading do bot não encontrada.");
    return respond(409, { ok: false, event: "ERROR", message: "Conta de trading do bot não encontrada." });
  }
  const account = normalizeAccount(accountRow);

  // 1. Circuit breaker diário (mesma regra do terminal manual).
  const circuit = await getCircuitState(supabase, bot.user_id, account);
  if (circuit.breaker.isLocked) {
    const message = `Circuit breaker ativo: perda da sessão ${circuit.breaker.dailyLoss.toFixed(2)} ≥ ${circuit.breaker.maxDailyLoss.toFixed(2)} ${account.currency}. Sinal BUY ${signal.symbol} bloqueado.`;
    await log(supabase, bot.id, "CIRCUIT_BREAKER_BLOCKED", message, signalPayload(signal));
    await notify(`${bot.name}: ${message}`, "CIRCUIT BREAKER");
    return respond(409, { ok: false, event: "CIRCUIT_BREAKER_BLOCKED", message });
  }

  // 2. Sem pirâmides: um trade aberto por bot.
  const { data: open, error: openError } = await supabase
    .from("trading_journal")
    .select("id")
    .eq("user_id", bot.user_id)
    .eq("account_id", bot.account_id)
    .eq("status", "OPEN")
    .like("notes", `${botTag(bot.id)}%`)
    .limit(1);
  if (openError) throw new Error(openError.message);
  if (open.length > 0) {
    const message = "Já existe um trade aberto por este bot. Sinal BUY ignorado.";
    await log(supabase, bot.id, "SIGNAL_REJECTED", message, signalPayload(signal));
    return respond(409, { ok: false, event: "SIGNAL_REJECTED", message });
  }

  // 3. Tamanho da posição pelo risco do bot (limitado ao que resta do limite diário).
  const sizing = calculatePositionSize(account.balance, Number(bot.risk_per_trade_percent), signal.entryPrice, signal.stopLoss, "LONG");
  if (!sizing.valid) {
    await log(supabase, bot.id, "SIGNAL_REJECTED", sizing.error, signalPayload(signal));
    return respond(422, { ok: false, event: "SIGNAL_REJECTED", message: sizing.error });
  }
  if (sizing.riskAmount > circuit.breaker.remainingLoss + 0.01) {
    const message = `Risco do trade (${sizing.riskAmount.toFixed(2)}) excede o que resta do limite diário (${circuit.breaker.remainingLoss.toFixed(2)}).`;
    await log(supabase, bot.id, "CIRCUIT_BREAKER_BLOCKED", message, signalPayload(signal));
    return respond(409, { ok: false, event: "CIRCUIT_BREAKER_BLOCKED", message });
  }

  const filters = await getSymbolFilters(signal.symbol, bot.is_testnet);
  const quantity = floorToStep(Math.min(sizing.units, filters.maxQty), filters.stepSize);
  if (quantity < filters.minQty || quantity * signal.entryPrice < filters.minNotional) {
    const message = `Posição calculada (${quantity} ${filters.baseAsset}) abaixo do mínimo da Binance (minQty ${filters.minQty}, mínimo ${filters.minNotional} ${filters.quoteAsset}). Aumenta o saldo ou o risco.`;
    await log(supabase, bot.id, "SIGNAL_REJECTED", message, signalPayload(signal));
    return respond(422, { ok: false, event: "SIGNAL_REJECTED", message });
  }

  // 4. Entrada a mercado.
  const entry = await executeBinanceOrder(creds, { symbol: signal.symbol, side: "BUY", type: "MARKET", quantity }, filters.baseAsset);
  const filledPrice = entry.avgPrice > 0 ? entry.avgPrice : signal.entryPrice;
  const heldQty = floorToStep(entry.executedQty - entry.baseCommission, filters.stepSize);

  // 5. Proteção imediata na Binance (OCO stop + take profit).
  let ocoId: number | null = null;
  let ocoError: string | null = null;
  try {
    ocoId = (await placeProtectiveOco(creds, { symbol: signal.symbol, quantity: heldQty, takeProfit: signal.takeProfit, stopLoss: signal.stopLoss, tickSize: filters.tickSize })).orderListId;
  } catch (error) {
    ocoError = errorMessage(error);
  }

  const notes = `${botTag(bot.id)} ${bot.name} · ordem ${entry.orderId}${ocoId !== null ? ` · OCO ${ocoId}` : " · SEM OCO"}${bot.is_testnet ? " · TESTNET" : ""}`;
  const { error: journalError } = await supabase.from("trading_journal").insert({
    user_id: bot.user_id,
    account_id: bot.account_id,
    symbol: signal.symbol,
    direction: "LONG",
    entry_price: filledPrice,
    stop_loss: signal.stopLoss,
    take_profit: signal.takeProfit,
    position_size: heldQty,
    status: "OPEN",
    notes,
    fomo_check_passed: true,
    mental_state: "BOT",
  });
  if (journalError) await log(supabase, bot.id, "ERROR", `Ordem executada mas falhou o registo no diário: ${journalError.message}`);

  const summary = `BUY ${heldQty} ${filters.baseAsset} @ ${filledPrice.toFixed(filters.tickSize < 1 ? 6 : 2)} (risco ${sizing.riskAmount.toFixed(2)} ${account.currency})`;
  await log(supabase, bot.id, "ORDER_EXECUTED", summary, { orderId: entry.orderId, executedQty: entry.executedQty, avgPrice: filledPrice, ocoId, testnet: bot.is_testnet });

  if (ocoError) {
    await log(supabase, bot.id, "ERROR", `Posição aberta SEM proteção: a OCO falhou (${ocoError}). Coloca o stop manualmente na Binance.`);
    await notify(`⚠️ ${bot.name}: ${summary}\nA OCO de proteção FALHOU: ${ocoError}\nColoca o stop loss manualmente na Binance.`, "CIRCUIT BREAKER");
  } else {
    await notify(`${bot.name}${bot.is_testnet ? " (testnet)" : ""}: ${summary}\nSL ${signal.stopLoss} · TP ${signal.takeProfit} · OCO ${ocoId}`);
  }

  return respond(200, {
    ok: true,
    event: "ORDER_EXECUTED",
    message: summary,
    details: { orderId: entry.orderId, quantity: heldQty, avgPrice: filledPrice, ocoId, ocoError, testnet: bot.is_testnet },
  });
}

async function handleSell(supabase: TypedSupabaseClient, bot: TradingBotRow, creds: BinanceCredentials, signal: Signal) {
  const { data: trades, error } = await supabase
    .from("trading_journal")
    .select("*")
    .eq("user_id", bot.user_id)
    .eq("account_id", bot.account_id)
    .eq("status", "OPEN")
    .like("notes", `${botTag(bot.id)}%`)
    .order("executed_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const trade = trades[0];
  if (!trade) {
    const message = "Não há posição aberta deste bot para fechar. Sinal SELL ignorado (spot não permite short).";
    await log(supabase, bot.id, "SIGNAL_REJECTED", message, signalPayload(signal));
    return respond(409, { ok: false, event: "SIGNAL_REJECTED", message });
  }

  const filters = await getSymbolFilters(signal.symbol, bot.is_testnet);
  await cancelOpenOrders(creds, signal.symbol);
  const free = await getFreeBalance(creds, filters.baseAsset);
  const quantity = floorToStep(Math.min(Number(trade.position_size), free), filters.stepSize);

  if (quantity < filters.minQty) {
    const message = `Saldo ${filters.baseAsset} insuficiente para fechar (${free}). A OCO pode já ter executado o stop ou o take profit: fecha o trade manualmente no diário com o preço real.`;
    await log(supabase, bot.id, "SIGNAL_REJECTED", message, signalPayload(signal));
    await notify(`${bot.name}: ${message}`);
    return respond(409, { ok: false, event: "SIGNAL_REJECTED", message });
  }

  const exit = await executeBinanceOrder(creds, { symbol: signal.symbol, side: "SELL", type: "MARKET", quantity }, filters.baseAsset);
  const exitPrice = exit.avgPrice > 0 ? exit.avgPrice : (signal.entryPrice ?? Number(trade.entry_price));
  const entryPrice = Number(trade.entry_price);
  const netPnl = calculateTradePnl("LONG", entryPrice, exitPrice, quantity);
  const rMultiple = calculateRMultiple({ direction: "LONG", entryPrice, stopLoss: Number(trade.stop_loss), exitPrice, positionSize: quantity });

  const { error: closeError } = await supabase
    .from("trading_journal")
    .update({ exit_price: exitPrice, net_pnl: netPnl, r_multiple: rMultiple, status: "CLOSED", closed_at: new Date().toISOString() })
    .eq("id", trade.id)
    .eq("user_id", bot.user_id);
  if (closeError) await log(supabase, bot.id, "ERROR", `Posição fechada na Binance mas falhou o diário: ${closeError.message}`);

  const { data: account } = await supabase.from("trading_accounts").select("balance, currency").eq("id", bot.account_id).eq("user_id", bot.user_id).maybeSingle();
  if (account) {
    await supabase
      .from("trading_accounts")
      .update({ balance: Math.max(0, Math.round((Number(account.balance) + netPnl) * 100) / 100) })
      .eq("id", bot.account_id)
      .eq("user_id", bot.user_id);
  }

  const summary = `SELL ${quantity} ${filters.baseAsset} @ ${exitPrice} · P&L ${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)} (${rMultiple === null ? "—" : `${rMultiple}R`})`;
  await log(supabase, bot.id, "ORDER_EXECUTED", summary, { orderId: exit.orderId, executedQty: exit.executedQty, avgPrice: exitPrice, netPnl, rMultiple, testnet: bot.is_testnet });
  await notify(`${bot.name}${bot.is_testnet ? " (testnet)" : ""}: ${summary}`);
  return respond(200, { ok: true, event: "ORDER_EXECUTED", message: summary, details: { orderId: exit.orderId, quantity, avgPrice: exitPrice, netPnl, rMultiple } });
}

/**
 * POST /api/trading/bot/webhook
 * Header X-Bot-Secret (ou campo "secret") + { action, symbol, entryPrice, stopLoss, takeProfit }.
 */
export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "O corpo do pedido não é JSON válido.");
  }

  const parsed = signalSchema.safeParse(json);
  const headerSecret = request.headers.get("x-bot-secret")?.trim() ?? "";
  const bodySecret = typeof json === "object" && json !== null && "secret" in json && typeof json.secret === "string" ? json.secret.trim() : "";
  const secret = headerSecret || bodySecret;
  if (!/^[0-9a-f]{48}$/.test(secret)) return jsonError(401, "unauthorized", "X-Bot-Secret em falta ou inválido.");

  let supabase: TypedSupabaseClient;
  try {
    supabase = createServiceClient();
  } catch (error) {
    return jsonError(500, "configuration_error", errorMessage(error));
  }

  try {
    const { data: bot, error: botError } = await supabase.from("trading_bots").select("*").eq("webhook_secret", secret).maybeSingle();
    if (botError) return jsonError(500, "database_error", botError.message);
    if (!bot || !safeEqual(bot.webhook_secret, secret)) return jsonError(401, "unauthorized", "X-Bot-Secret inválido.");

    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      await log(supabase, bot.id, "SIGNAL_REJECTED", `Payload inválido: ${message}`);
      return jsonError(400, "invalid_payload", message, parsed.error.issues);
    }
    const signal = parsed.data;
    await log(supabase, bot.id, "SIGNAL_RECEIVED", `${signal.action} ${signal.symbol}`, signalPayload(signal));

    if (!bot.is_active) {
      await log(supabase, bot.id, "SIGNAL_REJECTED", "Bot desativado.");
      return respond(403, { ok: false, event: "SIGNAL_REJECTED", message: "Bot desativado." });
    }
    if (signal.symbol !== bot.symbol) {
      const message = `Símbolo ${signal.symbol} não corresponde ao do bot (${bot.symbol}).`;
      await log(supabase, bot.id, "SIGNAL_REJECTED", message);
      return respond(422, { ok: false, event: "SIGNAL_REJECTED", message });
    }
    if (!bot.api_key_encrypted || !bot.api_secret_encrypted) {
      await log(supabase, bot.id, "SIGNAL_REJECTED", "Bot sem chaves API da Binance.");
      return respond(409, { ok: false, event: "SIGNAL_REJECTED", message: "Bot sem chaves API da Binance." });
    }
    if (!isVaultConfigured()) return jsonError(500, "configuration_error", "BOT_ENCRYPTION_KEY não está configurada no servidor.");

    const creds: BinanceCredentials = { apiKey: decryptSecret(bot.api_key_encrypted), apiSecret: decryptSecret(bot.api_secret_encrypted), isTestnet: bot.is_testnet };

    try {
      if (signal.action === "BUY" && signal.entryPrice !== undefined && signal.stopLoss !== undefined && signal.takeProfit !== undefined) {
        return await handleBuy(supabase, bot, creds, { ...signal, entryPrice: signal.entryPrice, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit });
      }
      return await handleSell(supabase, bot, creds, signal);
    } catch (error) {
      const message = errorMessage(error);
      await log(supabase, bot.id, "ERROR", message, signalPayload(signal));
      await notify(`❌ ${bot.name}: ${signal.action} ${signal.symbol} falhou — ${message}`);
      if (error instanceof BinanceApiError) return respond(502, { ok: false, event: "ERROR", message });
      return jsonError(500, "internal_error", message);
    }
  } catch (error) {
    return jsonError(500, "internal_error", errorMessage(error));
  }
}
