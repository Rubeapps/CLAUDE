"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess, formNumber, formToObject, zodMessage, type ActionState } from "@/lib/action-state";
import { calculateRMultiple, calculateStopDistance, calculateTradePnl } from "@/lib/calculations/risk";
import { requireUser } from "@/lib/supabase/server";

const positive = formNumber.pipe(z.number().positive("tem de ser > 0"));

const accountSchema = z.object({
  name: z.string().trim().min(1, "obrigatório").max(80),
  balance: formNumber.pipe(z.number().min(0, "não pode ser negativo").max(9_999_999_999)),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3,5}$/, "moeda inválida (ex.: USD, EUR, USDT)"),
  max_risk_percent: formNumber.pipe(z.number().gt(0, "tem de ser > 0").max(99.99, "máximo 99.99")),
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

  const { supabase, user } = await requireUser();
  const { data: account, error: accountError } = await supabase.from("trading_accounts").select("id").eq("id", t.account_id).eq("user_id", user.id).maybeSingle();
  if (accountError) return actionError(accountError.message);
  if (!account) return actionError("Conta não encontrada.");

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

  const { data: account, error: accountError } = await supabase.from("trading_accounts").select("balance").eq("id", trade.account_id).eq("user_id", user.id).maybeSingle();
  if (accountError) return actionError(accountError.message);
  if (account) {
    const newBalance = Math.round((Number(account.balance) + netPnl) * 100) / 100;
    const { error: balanceError } = await supabase.from("trading_accounts").update({ balance: Math.max(0, newBalance) }).eq("id", trade.account_id).eq("user_id", user.id);
    if (balanceError) return actionError(balanceError.message);
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
