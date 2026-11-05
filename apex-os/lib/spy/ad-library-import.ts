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

/** Valida o texto colado. Devolve erro legível em vez de lançar. */
export function parseLibraryPayload(raw: string): { ok: true; payload: LibraryPayload } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw.trim());
  } catch {
    return { ok: false, error: "O conteúdo colado não é o JSON do botão. Carrega de novo no botão na Ad Library e cola aqui." };
  }
  const parsed = libraryPayloadSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Formato inválido." };
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
