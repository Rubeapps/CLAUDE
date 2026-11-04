import "server-only";

import type { SpyTargetRow, SpyTrackedProductInsert } from "@/lib/database.types";
import { errorMessage } from "@/lib/http";
import { fetchStoreProducts, type ProductSnapshot } from "@/lib/shopify";
import type { TypedSupabaseClient } from "@/lib/supabase/server";
import {
  escapeMarkdownV2,
  formatNewProductAlert,
  formatPriceChangeAlert,
  formatStockOutAlert,
  isTelegramConfigured,
  sendTelegramMessage,
  type SpyAlertProduct,
} from "@/lib/telegram";

/** Máximo de alertas individuais por loja e execução (o resto vai num resumo). */
const MAX_ALERTS_PER_TARGET = 10;
const ALERT_SPACING_MS = 350;
const UPSERT_CHUNK = 500;

export type SpyTarget = Pick<SpyTargetRow, "id" | "store_name" | "store_url" | "last_scraped_at">;

export interface PriceChange {
  title: string;
  oldPrice: number;
  newPrice: number;
}

export interface TargetScanResult {
  targetId: string;
  storeName: string;
  ok: boolean;
  error?: string;
  baseline: boolean;
  scanned: number;
  newProducts: number;
  priceChanges: number;
  stockOuts: number;
  restocks: number;
  alertsSent: number;
  alertErrors: string[];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface ExistingProduct {
  id: string;
  shopify_product_id: number;
  current_price: number;
  is_available: boolean;
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

/**
 * Faz o scan de uma loja:
 *  - Produto novo: shopify_product_id inexistente em spy_tracked_products.
 *  - Variação de preço: current_price atualizado + registo em spy_price_history.
 *  - Rutura de stock: todas as variantes com available: false.
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
    stockOuts: 0,
    restocks: 0,
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
        .select("id, shopify_product_id, current_price, is_available")
        .eq("target_id", target.id)
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      for (const row of data) {
        existing.set(Number(row.shopify_product_id), {
          id: row.id,
          shopify_product_id: Number(row.shopify_product_id),
          current_price: Number(row.current_price),
          is_available: row.is_available,
        });
      }
      if (data.length < pageSize) break;
    }

    const now = new Date().toISOString();
    const newSnapshots: ProductSnapshot[] = [];
    const priceChanged: { snapshot: ProductSnapshot; previous: ExistingProduct }[] = [];
    const stockOuts: ProductSnapshot[] = [];

    for (const snapshot of products) {
      const previous = existing.get(snapshot.shopifyProductId);
      if (!previous) {
        newSnapshots.push(snapshot);
        continue;
      }
      if (Math.abs(previous.current_price - snapshot.currentPrice) >= 0.005) {
        priceChanged.push({ snapshot, previous });
      }
      if (previous.is_available && !snapshot.isAvailable) stockOuts.push(snapshot);
      if (!previous.is_available && snapshot.isAvailable) result.restocks += 1;
    }

    const rows: SpyTrackedProductInsert[] = products.map((snapshot) => ({
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
    }));

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const { error } = await supabase
        .from("spy_tracked_products")
        .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "target_id,shopify_product_id" });
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
    result.stockOuts = stockOuts.length;
    result.ok = true;

    if (notify && isTelegramConfigured()) {
      const messages: string[] = [];
      if (result.baseline) {
        messages.push(
          `🛰️ *${escapeMarkdownV2("Nova loja monitorizada")}* — ${escapeMarkdownV2(target.store_name)}\n${escapeMarkdownV2(`Catálogo base gravado: ${products.length} produtos. A partir de agora recebes alertas de novidades e preços.`)}`,
        );
      } else {
        for (const snapshot of newSnapshots) messages.push(formatNewProductAlert(toAlert(target, snapshot)));
        for (const { snapshot, previous } of priceChanged) messages.push(formatPriceChangeAlert(toAlert(target, snapshot), previous.current_price));
        for (const snapshot of stockOuts) messages.push(formatStockOutAlert(toAlert(target, snapshot)));
      }

      const toSend = messages.slice(0, MAX_ALERTS_PER_TARGET);
      const overflow = messages.length - toSend.length;
      if (overflow > 0) {
        toSend.push(escapeMarkdownV2(`… e mais ${overflow} alertas em ${target.store_name}. Abre o Spy Engine para ver tudo.`));
      }

      for (const message of toSend) {
        const sent = await sendTelegramMessage(message);
        if (sent.ok) result.alertsSent += 1;
        else result.alertErrors.push(sent.error);
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
