import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireServerEnv } from "@/lib/env";
import { errorMessage, jsonError } from "@/lib/http";
import { scanTargets, type TargetScanResult } from "@/lib/spy-engine";
import { createServiceClient } from "@/lib/supabase/server";
import { formatRunSummary, isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  target_id: z.string().uuid().optional(),
  notify: z.enum(["true", "false"]).optional(),
  summary: z.enum(["true", "false"]).optional(),
});

interface CronResponseBody {
  ok: boolean;
  started_at: string;
  finished_at: string;
  targets: number;
  totals: { scanned: number; new_products: number; price_changes: number; stock_outs: number; errors: number };
  results: TargetScanResult[];
}

function isAuthorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(request: NextRequest) {
  try {
    let secret: string;
    try {
      secret = requireServerEnv("CRON_SECRET");
    } catch (error) {
      return jsonError(500, "configuration_error", errorMessage(error));
    }
    if (!isAuthorized(request, secret)) {
      return jsonError(401, "unauthorized", "Header Authorization: Bearer <CRON_SECRET> inválido ou ausente.");
    }

    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) return jsonError(400, "invalid_query", "Parâmetros inválidos.", query.error.issues);

    const startedAt = new Date().toISOString();
    const supabase = createServiceClient();

    let targetsQuery = supabase.from("spy_targets").select("id, store_name, store_url, last_scraped_at").eq("is_active", true).order("last_scraped_at", { ascending: true, nullsFirst: true });
    if (query.data.target_id) targetsQuery = targetsQuery.eq("id", query.data.target_id);

    const { data: targets, error } = await targetsQuery;
    if (error) return jsonError(500, "database_error", error.message);
    if (query.data.target_id && targets.length === 0) {
      return jsonError(404, "target_not_found", "Loja não encontrada ou inativa.");
    }

    const notify = query.data.notify !== "false";
    const results = await scanTargets(supabase, targets, notify);

    const totals = results.reduce(
      (acc, r) => ({
        scanned: acc.scanned + r.scanned,
        new_products: acc.new_products + (r.baseline ? 0 : r.newProducts),
        price_changes: acc.price_changes + r.priceChanges,
        stock_outs: acc.stock_outs + r.stockOuts,
        errors: acc.errors + (r.ok ? 0 : 1),
      }),
      { scanned: 0, new_products: 0, price_changes: 0, stock_outs: 0, errors: 0 },
    );

    if (notify && query.data.summary === "true" && isTelegramConfigured()) {
      await sendTelegramMessage(
        formatRunSummary({ targets: results.length, newProducts: totals.new_products, priceChanges: totals.price_changes, stockOuts: totals.stock_outs, errors: totals.errors }),
      );
    }

    const body: CronResponseBody = {
      ok: totals.errors === 0,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      targets: results.length,
      totals,
      results,
    };
    // 200 mesmo com falhas parciais (detalhe em results[]); 500 só para falhas globais.
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    return jsonError(500, "internal_error", errorMessage(error));
  }
}

export async function POST(request: NextRequest) {
  return run(request);
}

export async function GET(request: NextRequest) {
  return run(request);
}
