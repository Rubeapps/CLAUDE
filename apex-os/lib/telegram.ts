import "server-only";

import { z } from "zod";

/**
 * Cliente Telegram Bot API (sendMessage) com MarkdownV2.
 * Docs: https://core.telegram.org/bots/api#sendmessage
 */

const telegramResponseSchema = z.object({
  ok: z.boolean(),
  description: z.string().optional(),
  error_code: z.number().optional(),
  parameters: z.object({ retry_after: z.number().optional() }).optional(),
});

export type TelegramSendResult = { ok: true } | { ok: false; error: string };

const TELEGRAM_MAX_LENGTH = 4096;
const MARKDOWN_V2_SPECIAL = /[_*[\]()~`>#+\-=|{}.!\\]/g;

/** Escapa texto livre para MarkdownV2 (obrigatório para todos os caracteres especiais). */
export function escapeMarkdownV2(text: string): string {
  return text.replace(MARKDOWN_V2_SPECIAL, (char) => `\\${char}`);
}

/** Dentro de (url) do MarkdownV2 só `)` e `\` precisam de escape. */
function escapeMarkdownV2Url(url: string): string {
  return url.replace(/[)\\]/g, (char) => `\\${char}`);
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Envia uma mensagem já formatada em MarkdownV2. Respeita 429 (retry_after) com até 3 tentativas.
 * Nunca lança: devolve um resultado tipado para o chamador decidir.
 */
export async function sendTelegramMessage(markdownV2Text: string, chatId?: string): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const targetChat = chatId ?? process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !targetChat) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID não configurados." };
  }

  const text = markdownV2Text.length > TELEGRAM_MAX_LENGTH ? `${markdownV2Text.slice(0, TELEGRAM_MAX_LENGTH - 2)}\\…` : markdownV2Text;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: targetChat,
          text,
          parse_mode: "MarkdownV2",
          link_preview_options: { is_disabled: false },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const parsed = telegramResponseSchema.safeParse(await response.json());
      if (parsed.success && parsed.data.ok) return { ok: true };

      const retryAfter = parsed.success ? parsed.data.parameters?.retry_after : undefined;
      if (response.status === 429 && retryAfter !== undefined && attempt < 3) {
        await sleep((retryAfter + 1) * 1000);
        continue;
      }
      return {
        ok: false,
        error: parsed.success ? `Telegram ${response.status}: ${parsed.data.description ?? "erro desconhecido"}` : `Telegram ${response.status}: resposta inválida`,
      };
    } catch (error) {
      if (attempt === 3) {
        return { ok: false, error: error instanceof Error ? error.message : "Falha de rede ao contactar o Telegram." };
      }
      await sleep(attempt * 1000);
    }
  }
  return { ok: false, error: "Telegram: tentativas esgotadas." };
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

export interface SpyAlertProduct {
  storeName: string;
  storeUrl: string;
  title: string;
  handle: string;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
}

function productLink(product: SpyAlertProduct): string {
  const url = `${product.storeUrl.replace(/\/$/, "")}/products/${encodeURIComponent(product.handle)}`;
  return `[${escapeMarkdownV2("Ver produto")}](${escapeMarkdownV2Url(url)})`;
}

export function formatNewProductAlert(product: SpyAlertProduct): string {
  const lines = [
    `🆕 *${escapeMarkdownV2("Produto novo")}* — ${escapeMarkdownV2(product.storeName)}`,
    "",
    `*${escapeMarkdownV2(product.title)}*`,
    `💶 ${escapeMarkdownV2("Preço:")} *${escapeMarkdownV2(formatMoney(product.price))}*`,
  ];
  if (product.compareAtPrice !== null && product.compareAtPrice > product.price) {
    lines.push(`🏷️ ${escapeMarkdownV2("Antes:")} ~${escapeMarkdownV2(formatMoney(product.compareAtPrice))}~`);
  }
  lines.push("", productLink(product));
  return lines.join("\n");
}

export function formatPriceChangeAlert(product: SpyAlertProduct, oldPrice: number): string {
  const delta = product.price - oldPrice;
  const pct = oldPrice > 0 ? (delta / oldPrice) * 100 : 0;
  const arrow = delta < 0 ? "📉" : "📈";
  const sign = delta > 0 ? "+" : "";
  return [
    `${arrow} *${escapeMarkdownV2("Alteração de preço")}* — ${escapeMarkdownV2(product.storeName)}`,
    "",
    `*${escapeMarkdownV2(product.title)}*`,
    `${escapeMarkdownV2(formatMoney(oldPrice))} → *${escapeMarkdownV2(formatMoney(product.price))}* \\(${escapeMarkdownV2(`${sign}${pct.toFixed(1)}%`)}\\)`,
    "",
    productLink(product),
  ].join("\n");
}

export function formatStockOutAlert(product: SpyAlertProduct): string {
  return [
    `⛔ *${escapeMarkdownV2("Rutura de stock")}* — ${escapeMarkdownV2(product.storeName)}`,
    "",
    `*${escapeMarkdownV2(product.title)}*`,
    escapeMarkdownV2("Todas as variantes estão indisponíveis."),
    "",
    productLink(product),
  ].join("\n");
}

export function formatRunSummary(params: { targets: number; newProducts: number; priceChanges: number; stockOuts: number; errors: number }): string {
  return [
    `🕵️ *${escapeMarkdownV2("Spy Engine — resumo")}*`,
    escapeMarkdownV2(`Lojas: ${params.targets} · Novos: ${params.newProducts} · Preços: ${params.priceChanges} · Rutura: ${params.stockOuts} · Erros: ${params.errors}`),
  ].join("\n");
}
