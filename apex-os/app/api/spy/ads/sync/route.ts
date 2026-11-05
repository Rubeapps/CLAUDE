import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorMessage, jsonError } from "@/lib/http";
import { isMetaConfigured, MetaApiError, parsePageId, syncPageAds, type AdsSyncResult } from "@/lib/meta-ads";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  /** Page ID numérico ou link da Ad Library com view_all_page_id. Opcional se targetId tiver meta_page_id. */
  pageId: z.string().trim().max(500).optional(),
  targetId: z.string().uuid().optional(),
});

interface SyncResponseBody {
  ok: true;
  result: AdsSyncResult;
}

/**
 * POST /api/spy/ads/sync — { pageId?: string, targetId?: string }
 * Sincroniza os anúncios ativos de uma página Meta para o utilizador autenticado.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return jsonError(401, "unauthorized", "Sessão inválida. Volta a entrar.");
    const userId = auth.user.id;

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return jsonError(400, "invalid_json", "O corpo do pedido não é JSON válido.");
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "invalid_body", "Parâmetros inválidos.", parsed.error.issues);

    if (!isMetaConfigured()) {
      return jsonError(500, "meta_not_configured", "META_ACCESS_TOKEN não está configurado. Adiciona-o nas variáveis de ambiente da Vercel.");
    }

    let pageId = parsed.data.pageId ? parsePageId(parsed.data.pageId) : null;
    let targetId: string | null = null;

    if (parsed.data.targetId) {
      const { data: target, error } = await supabase.from("spy_targets").select("id, meta_page_id").eq("id", parsed.data.targetId).eq("user_id", userId).maybeSingle();
      if (error) return jsonError(500, "database_error", error.message);
      if (!target) return jsonError(404, "target_not_found", "Loja não encontrada.");
      targetId = target.id;
      if (!pageId && target.meta_page_id) pageId = parsePageId(target.meta_page_id);
    }

    if (!pageId) {
      return jsonError(400, "missing_page_id", "Indica um Page ID numérico da Meta (ou um link da Ad Library com view_all_page_id), ou escolhe uma loja com Meta Page ID.");
    }

    const result = await syncPageAds(supabase, { userId, pageId, targetId });
    const body: SyncResponseBody = { ok: true, result };
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    if (error instanceof MetaApiError) {
      // Códigos Meta: 190 token inválido/expirado, 10/200 sem permissão, 4/17/613 rate limit.
      if (error.code === 190) return jsonError(401, "meta_token_invalid", error.message);
      if (error.code === 4 || error.code === 17 || error.code === 613) return jsonError(502, "meta_rate_limited", error.message);
      return jsonError(error.status >= 400 && error.status < 500 ? 400 : 502, "meta_api_error", error.message);
    }
    return jsonError(500, "internal_error", errorMessage(error));
  }
}
