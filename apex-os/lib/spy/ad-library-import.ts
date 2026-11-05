import { z } from "zod";
import { BOOKMARKLET_MAX_CARDS, BOOKMARKLET_MAX_TEXT } from "./bookmarklet.ts";

/** Formato do JSON copiado pelo botão "Enviar para o Apex". */
export const libraryPayloadSchema = z.object({
  v: z.literal(1),
  source: z.literal("apex-ad-library"),
  url: z.string().url().max(3000),
  pageTitle: z.string().max(500).optional().default(""),
  capturedAt: z.string().max(40).optional(),
  cards: z
    .array(
      z.object({
        text: z.string().max(BOOKMARKLET_MAX_TEXT + 100),
        links: z.array(z.string().max(3000)).max(25).default([]),
        videoUrl: z.string().max(5000).nullable().default(null),
        posterUrl: z.string().max(5000).nullable().default(null),
        imageUrl: z.string().max(5000).nullable().default(null),
      }),
    )
    .min(1, "o JSON não tem anúncios")
    .max(BOOKMARKLET_MAX_CARDS, `máximo ${BOOKMARKLET_MAX_CARDS} anúncios por importação`),
});

export type LibraryPayload = z.infer<typeof libraryPayloadSchema>;

const NOT_PAYLOAD = "Isto não é o conteúdo do botão. Abre a Ad Library da marca, carrega no favorito \"Enviar para o Apex\" e cola aqui o que ele copiar.";

/** Link da Ad Library com os anúncios ativos de uma página. */
export function adLibraryPageUrl(pageId: string): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${encodeURIComponent(pageId)}`;
}

/**
 * Reconhece quando o utilizador cola um Page ID ou um link da Ad Library em vez do JSON do botão,
 * para lhe oferecer o atalho certo. Devolve o Page ID ou null.
 */
export function detectPageIdInput(raw: string): string | null {
  const value = raw.trim();
  if (/^\d{5,25}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const id = url.searchParams.get("view_all_page_id") ?? url.searchParams.get("id");
    return id && /^\d{5,25}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Valida o texto colado. Devolve erro legível em português em vez de lançar. */
export function parseLibraryPayload(raw: string): { ok: true; payload: LibraryPayload } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw.trim());
  } catch {
    return { ok: false, error: NOT_PAYLOAD };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json) || !("source" in json) || json.source !== "apex-ad-library") {
    return { ok: false, error: NOT_PAYLOAD };
  }
  const parsed = libraryPayloadSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const custom = issue && issue.code === "too_big" ? issue.message : issue && issue.code === "too_small" ? "O botão não encontrou anúncios nesta página." : null;
    return { ok: false, error: custom ?? "O conteúdo está incompleto ou foi alterado. Volta a carregar no botão e cola de novo." };
  }
  return { ok: true, payload: parsed.data };
}

/** Identificador estável quando o URL não traz view_all_page_id. */
export function fallbackPageId(pageName: string | null): string {
  const slug = (pageName ?? "desconhecida")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `pagina:${slug || "desconhecida"}`;
}
