"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess, formNumber, formToObject, zodMessage, type ActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/supabase/server";
import { encryptSecret, isVaultConfigured } from "@/lib/trading/crypto-vault";

const keyField = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === "" || /^[A-Za-z0-9]{16,128}$/.test(v), "formato de chave inválido");

const createSchema = z.object({
  name: z.string().trim().min(1, "obrigatório").max(80),
  account_id: z.string().uuid("escolhe uma conta"),
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{5,20}$/, "símbolo inválido (ex.: BTCUSDT)"),
  risk_per_trade_percent: formNumber.pipe(z.number().gt(0, "tem de ser > 0").max(10, "máximo 10% por trade")),
  api_key: keyField,
  api_secret: keyField,
});

const keysSchema = z.object({ id: z.string().uuid(), api_key: keyField, api_secret: keyField });
const idSchema = z.object({ id: z.string().uuid() });
const liveSchema = z.object({ id: z.string().uuid(), confirm: z.literal("LIVE", { message: "Escreve LIVE para confirmar." }) });

function revalidate() {
  revalidatePath("/trading/bots");
}

export async function createBot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const d = parsed.data;
  if ((d.api_key === "") !== (d.api_secret === "")) return actionError("Preenche a API Key e a API Secret, ou deixa as duas vazias.");
  if (d.api_key !== "" && !isVaultConfigured()) return actionError("BOT_ENCRYPTION_KEY não está configurada no servidor: não é possível guardar chaves.");

  const { supabase, user } = await requireUser();
  const { data: account } = await supabase.from("trading_accounts").select("id").eq("id", d.account_id).eq("user_id", user.id).maybeSingle();
  if (!account) return actionError("Conta não encontrada.");

  const { error } = await supabase.from("trading_bots").insert({
    user_id: user.id,
    account_id: d.account_id,
    name: d.name,
    symbol: d.symbol,
    strategy_type: "WEBHOOK_SIGNAL",
    risk_per_trade_percent: d.risk_per_trade_percent,
    is_active: false,
    is_testnet: true,
    api_key_encrypted: d.api_key ? encryptSecret(d.api_key) : null,
    api_secret_encrypted: d.api_secret ? encryptSecret(d.api_secret) : null,
  });
  if (error) return actionError(error.message);
  revalidate();
  return actionSuccess(`Bot ${d.name} criado em modo TESTNET e desativado. Ativa-o quando estiveres pronto.`);
}

export async function updateBotKeys(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = keysSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  if (!parsed.data.api_key || !parsed.data.api_secret) return actionError("Preenche a API Key e a API Secret.");
  if (!isVaultConfigured()) return actionError("BOT_ENCRYPTION_KEY não está configurada no servidor.");
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("trading_bots")
    .update({ api_key_encrypted: encryptSecret(parsed.data.api_key), api_secret_encrypted: encryptSecret(parsed.data.api_secret) })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return actionError(error.message);
  if (data.length === 0) return actionError("Bot não encontrado.");
  revalidate();
  return actionSuccess("Chaves encriptadas e guardadas.");
}

export async function toggleBot(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("trading_bots").select("is_active").eq("id", parsed.data.id).eq("user_id", user.id).maybeSingle();
  if (!data) return;
  await supabase.from("trading_bots").update({ is_active: !data.is_active }).eq("id", parsed.data.id).eq("user_id", user.id);
  revalidate();
}

/** Passar para conta real exige escrever LIVE; voltar a testnet é imediato. */
export async function setBotLive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = liveSchema.safeParse(formToObject(formData));
  if (!parsed.success) return actionError(zodMessage(parsed.error));
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("trading_bots").update({ is_testnet: false, is_active: false }).eq("id", parsed.data.id).eq("user_id", user.id);
  if (error) return actionError(error.message);
  revalidate();
  return actionSuccess("Bot em modo REAL e desativado. Confirma as chaves de produção antes de o ativar.");
}

export async function setBotTestnet(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("trading_bots").update({ is_testnet: true, is_active: false }).eq("id", parsed.data.id).eq("user_id", user.id);
  revalidate();
}

export async function rotateBotSecret(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("trading_bots").update({ webhook_secret: randomBytes(24).toString("hex") }).eq("id", parsed.data.id).eq("user_id", user.id);
  revalidate();
}

export async function deleteBot(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase.from("trading_bots").delete().eq("id", parsed.data.id).eq("user_id", user.id);
  revalidate();
}
