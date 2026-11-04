"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess, formNumber, formToObject, zodMessage, type ActionState } from "@/lib/action-state";
import { calculateRMultiple, calculateStopDistance, calculateTradePnl } from "@/lib/calculations/risk";
import { getCircuitState, normalizeAccount } from "@/lib/data/trading";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { isTelegramConfigured, sendTelegramAlert } from "@/lib/telegram";

/** Estados mentais que bloqueiam a execução (decisão emocional). */
export type BlockedMentalState = "REVENGE" | "EUPHORIC";
const BLOCKED_MENTAL_STATES: ReadonlySet<string> = new Set<BlockedMentalState>(["REVENGE", "EUPHORIC"]);

const positive = formNumber.pipe(z.number().positive("tem de ser > 0"));

const accountSchema = z.object({
  name: z.string().trim().min(1, "obrigatório").max(80),
  balance: formNumber.pipe(z.number().min(0, "não pode ser negativo").max(9_999_999_999)),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3,5}$/, "moeda inválida (ex.: USD, EUR, USDT)"),
  max_risk_percent: formNumber.pipe(z.number().gt(0, "tem de ser > 0").max(99.99, "máximo 99.99")),
  max_daily_loss_percent: formNumber.pipe(z.number().gt(0, "tem de ser > 0").max(99.99, "máximo 99.99")),
});

const updateAccountSchema = accountSchema.extend({ id: z.string().uuid() });

const tradeSchema = z.object({
  account_id: z.string().uuid("escolhe uma conta"),
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9._/-]{2,20}$/, "símbolo inválido"),
  direction: z.enum(["LONG", "SHORT"]),
  entry_price: positive,
  stop_loss: positive,
  take_profit: positive,
  position_size: positive,
  notes: z.string().trim().max(2000).optional(),
  fomo_check_passed: z.literal("true", { message: "Completa o checklist anti-FOMO antes de executar." }),
  mental_state: z.enum(["CALM", "FOCUSED", "TIRED", "ANXIOUS", "EUPHORIC", "REVENGE"], { message: "Indica o teu estado mental." }),
});

const closeSchema = z.object({ id: z.string().uuid(), exit_price: positive });
const idSchema = z.object({ id: z.string().uuid() });

function revalidate() {
  revalidatePath("/trading");
  revalidatePath("/dashboard");
}

export async function createAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = accountSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("trading_accounts").insert({ user_id: user.id, ...parsed.data });
  if (error) return actionError(error.message);
  revalidate();
  return actionSuccess(`Conta ${parsed.data.name} criada.`);
}

export async function updateAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateAccountSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const { id, ...fields } = parsed.data;
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("trading_accounts").update(fields).eq("id", id).eq("user_id", user.id);
  if (error) return actionError(error.message);
  revalidate();
  return actionSuccess("Conta atualizada.");
}

export async function deleteAccount(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("trading_accounts").delete().eq("id", parsed.data.id).eq("user_id", user.id);
  revalidate();
}

export async function logTrade(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = tradeSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const t = parsed.data;

  if (calculateStopDistance(t.direction, t.entry_price, t.stop_loss) <= 0) {
    return actionError(t.direction === "LONG" ? "Num LONG o Stop Loss tem de ficar abaixo da entrada." : "Num SHORT o Stop Loss tem de ficar acima da entrada.");
  }
  const rewardOk = t.direction === "LONG" ? t.take_profit > t.entry_price : t.take_profit < t.entry_price;
  if (!rewardOk) return actionError("O Take Profit está do lado errado da entrada.");

  if (BLOCKED_MENTAL_STATES.has(t.mental_state)) {
    return actionError("Estado mental de risco (revenge/euforia): execução bloqueada. Afasta-te do ecrã.");
  }

  const { supabase, user } = await requireUser();
  const { data: accountRow, error: accountError } = await supabase.from("trading_accounts").select("*").eq("id", t.account_id).eq("user_id", user.id).maybeSingle();
  if (accountError) return actionError(accountError.message);
  if (!accountRow) return actionError("Conta não encontrada.");

  // Revalidação no servidor: o gatekeeper do cliente não é uma barreira de segurança.
  const circuit = await getCircuitState(supabase, user.id, normalizeAccount(accountRow));
  if (circuit.breaker.isLocked) {
    return actionError(`Circuit breaker ativo: perda diária ${circuit.breaker.dailyLoss.toFixed(2)} ≥ limite ${circuit.breaker.maxDailyLoss.toFixed(2)}. Desbloqueia ${formatDateTime(circuit.breaker.unlocksAt)}.`);
  }
  if (circuit.cooldownUntil) {
    return actionError(`Cooldown pós-perda ativo até ${formatDateTime(circuit.cooldownUntil)}.`);
  }
  const tradeRisk = Math.abs(t.entry_price - t.stop_loss) * t.position_size;
  if (tradeRisk > circuit.breaker.remainingLoss + 0.01) {
    return actionError(`O risco deste trade (${tradeRisk.toFixed(2)}) excede o que resta do limite diário (${circuit.breaker.remainingLoss.toFixed(2)}).`);
  }

  const { error } = await supabase.from("trading_journal").insert({
    user_id: user.id,
    account_id: t.account_id,
    symbol: t.symbol,
    direction: t.direction,
    entry_price: t.entry_price,
    stop_loss: t.stop_loss,
    take_profit: t.take_profit,
    position_size: t.position_size,
    notes: t.notes && t.notes.length > 0 ? t.notes : null,
    status: "OPEN",
    fomo_check_passed: true,
    mental_state: t.mental_state,
  });
  if (error) return actionError(error.message);
  revalidate();
  return actionSuccess(`${t.direction} ${t.symbol} registado no diário.`);
}

/** Fecha um trade: calcula P&L e múltiplo R e soma o P&L ao saldo da conta. */
export async function closeTrade(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = closeSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const { supabase, user } = await requireUser();

  const { data: trade, error } = await supabase.from("trading_journal").select("*").eq("id", parsed.data.id).eq("user_id", user.id).maybeSingle();
  if (error) return actionError(error.message);
  if (!trade) return actionError("Trade não encontrado.");
  if (trade.status !== "OPEN") return actionError("Este trade já não está aberto.");

  const entry = Number(trade.entry_price);
  const size = Number(trade.position_size);
  const exit = parsed.data.exit_price;
  const netPnl = calculateTradePnl(trade.direction, entry, exit, size);
  const rMultiple = calculateRMultiple({ direction: trade.direction, entryPrice: entry, stopLoss: Number(trade.stop_loss), exitPrice: exit, positionSize: size });

  const { data: updated, error: updateError } = await supabase
    .from("trading_journal")
    .update({ exit_price: exit, net_pnl: netPnl, r_multiple: rMultiple, status: "CLOSED", closed_at: new Date().toISOString() })
    .eq("id", trade.id)
    .eq("user_id", user.id)
    .eq("status", "OPEN")
    .select("id");
  if (updateError) return actionError(updateError.message);
  if (updated.length === 0) return actionError("Este trade já foi fechado noutro separador.");

  const { data: account, error: accountError } = await supabase.from("trading_accounts").select("*").eq("id", trade.account_id).eq("user_id", user.id).maybeSingle();
  if (accountError) return actionError(accountError.message);
  if (account) {
    const newBalance = Math.max(0, Math.round((Number(account.balance) + netPnl) * 100) / 100);
    const { error: balanceError } = await supabase.from("trading_accounts").update({ balance: newBalance }).eq("id", trade.account_id).eq("user_id", user.id);
    if (balanceError) return actionError(balanceError.message);

    // Se este fecho fez disparar o circuit breaker, avisa no Telegram.
    if (netPnl < 0 && isTelegramConfigured()) {
      const after = await getCircuitState(supabase, user.id, normalizeAccount({ ...account, balance: newBalance }));
      const lossBefore = after.breaker.dailyLoss + netPnl;
      if (after.breaker.isLocked && lossBefore < after.breaker.maxDailyLoss) {
        await sendTelegramAlert(
          [
            `Conta ${account.name}: limite de perda diária atingido.`,
            `Perda da sessão: ${after.breaker.dailyLoss.toFixed(2)} ${account.currency} (limite ${after.breaker.maxDailyLoss.toFixed(2)}, ${after.maxDailyLossPercent}%).`,
            `Último trade: ${trade.direction} ${trade.symbol} ${netPnl.toFixed(2)}.`,
            `Terminal bloqueado até ${formatDateTime(after.breaker.unlocksAt)}.`,
          ].join("\n"),
          "CIRCUIT BREAKER",
        );
      }
    }
  }

  revalidate();
  return actionSuccess(`Fechado: ${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)} (${rMultiple === null ? "—" : `${rMultiple}R`}).`);
}

export async function cancelTrade(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("trading_journal").update({ status: "CANCELLED", closed_at: new Date().toISOString() }).eq("id", parsed.data.id).eq("user_id", user.id).eq("status", "OPEN");
  revalidate();
}

export async function deleteTrade(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("trading_journal").delete().eq("id", parsed.data.id).eq("user_id", user.id).neq("status", "CLOSED");
  revalidate();
}
