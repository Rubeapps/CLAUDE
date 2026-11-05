import "server-only";

import type { SpyTargetRow, SpyTrackedProductInsert } from "@/lib/database.types";
import { errorMessage } from "@/lib/http";
import { fetchStoreProducts, hasScalingTag, type ProductSnapshot } from "@/lib/shopify";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import {
  escapeMarkdownV2,
  formatNewProductAlert,
  formatPriceChangeAlert,
  formatStockOutAlert,
  isTelegramConfigured,
  sendTelegramAlert,
  type SpyAlertProduct,
} from "@/lib/telegram";

/** Máximo de alertas individuais por loja e execução (o resto vai num resumo). */
const MAX_ALERTS_PER_TARGET = 10;
const ALERT_SPACING_MS = 350;
const UPSERT_CHUNK = 500;
/** Um sinal de escala (tag best-seller ou movimento de stock) mantém is_scaling ativo durante 72h. */
export const SCALING_WINDOW_MS = 72 * 60 * 60 * 1000;

export type SpyTarget = Pick<SpyTargetRow, "id" | "store_name" | "store_url" | "last_scraped_at">;

export interface TargetScanResult {
  targetId: string;
  storeName: string;
  ok: boolean;
  error?: string;
  baseline: boolean;
  scanned: number;
  newProducts: number;
  priceChanges: number;
  priceDrops: number;
  stockOuts: number;
  restocks: number;
  scaling: number;
  newlyScaling: number;
  alertsSent: number;
  alertErrors: string[];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface ExistingProduct {
  id: string;
  current_price: number;
  is_available: boolean;
  is_scaling: boolean;
  available_variants: number | null;
  scaling_detected_at: string | null;
}

function toAlert(target: SpyTarget, snapshot: ProductSnapshot): SpyAlertProduct {
  return {
    storeName: target.store_name,
    storeUrl: target.store_url,
    title: snapshot.title,
    handle: snapshot.handle,
    price: snapshot.currentPrice,
    compareAtPrice: snapshot.compareAtPrice,
    imageUrl: snapshot.imageUrl,
  };
}

function formatScalingAlert(product: SpyAlertProduct, reason: string): string {
  const url = `${product.storeUrl.replace(/\/$/, "")}/products/${encodeURIComponent(product.handle)}`;
  return [
    `🔥 *${escapeMarkdownV2("A escalar")}* — ${escapeMarkdownV2(product.storeName)}`,
    "",
    `*${escapeMarkdownV2(product.title)}*`,
    escapeMarkdownV2(`Sinal: ${reason} · Preço ${product.price.toFixed(2)}`),
    "",
    `[${escapeMarkdownV2("Ver produto")}](${url.replace(/[)\\]/g, (c) => `\\${c}`)})`,
  ].join("\n");
}

interface ScalingDecision {
  isScaling: boolean;
  detectedAt: string | null;
  reason: string | null;
}

/**
 * Verificação de escala: tag de best-seller OU alteração de stock recente
 * (mudança no nº de variantes disponíveis ou na disponibilidade global) nas últimas 72h.
 */
export function decideScaling(snapshot: ProductSnapshot, previous: ExistingProduct | undefined, nowIso: string): ScalingDecision {
  const tagSignal = hasScalingTag(snapshot.tags);
  const stockSignal =
    previous !== undefined &&
    ((previous.available_variants !== null && previous.available_variants !== snapshot.availableVariants) || previous.is_available !== snapshot.isAvailable);

  const detectedAt = tagSignal || stockSignal ? nowIso : (previous?.scaling_detected_at ?? null);
  const recent = detectedAt !== null && new Date(nowIso).getTime() - new Date(detectedAt).getTime() <= SCALING_WINDOW_MS;
  const reason = tagSignal ? "tag best-seller" : stockSignal ? "movimento de stock" : null;
  return { isScaling: tagSignal || recent, detectedAt, reason };
}

/**
 * Faz o scan de uma loja:
 *  - Produto novo: shopify_product_id inexistente em spy_tracked_products.
 *  - Variação de preço: current_price atualizado + registo em spy_price_history.
 *  - Rutura de stock: todas as variantes com available: false.
 *  - Escala: tag best-seller ou alteração de stock recente ⇒ is_scaling = true.
 * Alertas Telegram [SPY]: produto novo, queda (e subida) de preço, rutura e início de escala.
 * O primeiro scan de uma loja é "baseline": grava o catálogo sem disparar um alerta por produto.
 */
export async function scanTarget(supabase: TypedSupabaseClient, target: SpyTarget, notify: boolean): Promise<TargetScanResult> {
  const result: TargetScanResult = {
    targetId: target.id,
    storeName: target.store_name,
    ok: false,
    baseline: target.last_scraped_at === null,
    scanned: 0,
    newProducts: 0,
    priceChanges: 0,
    priceDrops: 0,
    stockOuts: 0,
    restocks: 0,
    scaling: 0,
    newlyScaling: 0,
    alertsSent: 0,
    alertErrors: [],
  };

  try {
    const { products } = await fetchStoreProducts(target.store_url);
    result.scanned = products.length;

    const existing = new Map<number, ExistingProduct>();
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("spy_tracked_products")
        .select("id, shopify_product_id, current_price, is_available, is_scaling, available_variants, scaling_detected_at")
        .eq("target_id", target.id)
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      for (const row of data) {
        existing.set(Number(row.shopify_product_id), {
          id: row.id,
          current_price: Number(row.current_price),
          is_available: row.is_available,
          is_scaling: row.is_scaling === true,
          available_variants: row.available_variants,
          scaling_detected_at: row.scaling_detected_at,
        });
      }
      if (data.length < pageSize) break;
    }

    const now = new Date().toISOString();
    const newSnapshots: ProductSnapshot[] = [];
    const priceChanged: { snapshot: ProductSnapshot; previous: ExistingProduct }[] = [];
    const stockOuts: ProductSnapshot[] = [];
    const newlyScaling: { snapshot: ProductSnapshot; reason: string }[] = [];
    const rows: SpyTrackedProductInsert[] = [];

    for (const snapshot of products) {
      const previous = existing.get(snapshot.shopifyProductId);
      const scaling = decideScaling(snapshot, previous, now);
      if (scaling.isScaling) result.scaling += 1;

      if (!previous) {
        newSnapshots.push(snapshot);
      } else {
        if (Math.abs(previous.current_price - snapshot.currentPrice) >= 0.005) priceChanged.push({ snapshot, previous });
        if (previous.is_available && !snapshot.isAvailable) stockOuts.push(snapshot);
        if (!previous.is_available && snapshot.isAvailable) result.restocks += 1;
        if (!previous.is_scaling && scaling.isScaling) newlyScaling.push({ snapshot, reason: scaling.reason ?? "sinal recente" });
      }

      rows.push({
        target_id: target.id,
        shopify_product_id: snapshot.shopifyProductId,
        title: snapshot.title,
        handle: snapshot.handle,
        current_price: snapshot.currentPrice,
        compare_at_price: snapshot.compareAtPrice,
        is_available: snapshot.isAvailable,
        image_url: snapshot.imageUrl,
        published_at: snapshot.publishedAt,
        last_updated_at: now,
        is_scaling: scaling.isScaling,
        available_variants: snapshot.availableVariants,
        scaling_detected_at: scaling.detectedAt,
      });
    }

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const { error } = await supabase.from("spy_tracked_products").upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "target_id,shopify_product_id" });
      if (error) throw new Error(error.message);
    }

    if (priceChanged.length > 0) {
      const { error } = await supabase.from("spy_price_history").insert(
        priceChanged.map(({ snapshot, previous }) => ({
          tracked_product_id: previous.id,
          old_price: previous.current_price,
          new_price: snapshot.currentPrice,
          detected_at: now,
        })),
      );
      if (error) throw new Error(error.message);
    }

    const { error: targetError } = await supabase.from("spy_targets").update({ last_scraped_at: now }).eq("id", target.id);
    if (targetError) throw new Error(targetError.message);

    result.newProducts = newSnapshots.length;
    result.priceChanges = priceChanged.length;
    result.priceDrops = priceChanged.filter(({ snapshot, previous }) => snapshot.currentPrice < previous.current_price).length;
    result.stockOuts = stockOuts.length;
    result.newlyScaling = newlyScaling.length;
    result.ok = true;

    if (notify && isTelegramConfigured()) {
      const messages: string[] = [];
      if (result.baseline) {
        messages.push(
          `🛰️ *${escapeMarkdownV2("Nova loja monitorizada")}* — ${escapeMarkdownV2(target.store_name)}\n${escapeMarkdownV2(
            `Catálogo base gravado: ${products.length} produtos (${result.scaling} com sinal de escala). A partir de agora recebes alertas de novidades e preços.`,
          )}`,
        );
      } else {
        for (const snapshot of newSnapshots) messages.push(formatNewProductAlert(toAlert(target, snapshot)));
        // Quedas de preço primeiro (sinal mais acionável), depois subidas.
        const sorted = [...priceChanged].sort((a, b) => a.snapshot.currentPrice - a.previous.current_price - (b.snapshot.currentPrice - b.previous.current_price));
        for (const { snapshot, previous } of sorted) messages.push(formatPriceChangeAlert(toAlert(target, snapshot), previous.current_price));
        for (const { snapshot, reason } of newlyScaling) messages.push(formatScalingAlert(toAlert(target, snapshot), reason));
        for (const snapshot of stockOuts) messages.push(formatStockOutAlert(toAlert(target, snapshot)));
      }

      const toSend = messages.slice(0, MAX_ALERTS_PER_TARGET);
      const overflow = messages.length - toSend.length;
      if (overflow > 0) toSend.push(escapeMarkdownV2(`… e mais ${overflow} alertas em ${target.store_name}. Abre o Spy Engine para ver tudo.`));

      for (const message of toSend) {
        const sent = await sendTelegramAlert(message, "SPY", { markdown: true });
        if (sent) result.alertsSent += 1;
        else result.alertErrors.push("Falha ao enviar alerta Telegram.");
        await sleep(ALERT_SPACING_MS);
      }
    }
  } catch (error) {
    result.ok = false;
    result.error = errorMessage(error);
  }

  return result;
}

/** Corre scans com concorrência limitada para não saturar o runtime nem as lojas. */
export async function scanTargets(supabase: TypedSupabaseClient, targets: readonly SpyTarget[], notify: boolean, concurrency = 3): Promise<TargetScanResult[]> {
  const results: TargetScanResult[] = new Array<TargetScanResult>(targets.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const index = cursor;
      cursor += 1;
      const target = targets[index];
      if (target) results[index] = await scanTarget(supabase, target, notify);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
  return results;
}
