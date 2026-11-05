/**
 * Leitura de cartões da Meta Ad Library capturados pelo botão "Enviar para o Apex".
 * O botão envia o texto visível de cada anúncio; aqui extraímos ID, data de início,
 * nº de cópias, copy, título e destino. Suporta interface em EN, PT-PT, PT-BR e ES.
 * Funções puras (sem I/O) para poderem ser testadas e ajustadas quando a Meta mudar o layout.
 */

export interface RawLibraryCard {
  /** innerText do cartão do anúncio. */
  text: string;
  /** hrefs dos links do cartão. */
  links: string[];
  videoUrl: string | null;
  posterUrl: string | null;
  imageUrl: string | null;
}

export interface ParsedLibraryAd {
  adArchiveId: string;
  pageName: string | null;
  caption: string | null;
  headline: string | null;
  /** YYYY-MM-DD, ou null se não for possível ler a data. */
  startDate: string | null;
  copies: number;
  landingUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  isActive: boolean;
}

const ID_PATTERN = /(?:Library ID|ID da biblioteca|ID de la biblioteca|Identificação da biblioteca|ID de la Biblioteca)\s*:?\s*(\d{6,25})/i;
const START_PATTERN =
  /(?:Started running on|Começou a ser veiculad[oa] (?:em|a)|Começou a ser publicad[oa] (?:em|a)|Veiculação iniciada em|Em veiculação desde|Empezó a circular el|Comenzó a circular el)\s*:?\s*([^\n·]+)/i;
const COPIES_PATTERN = /(\d+)\s+(?:ads? use|anúncios? (?:usa|usam|utiliza|utilizam)|anuncios? (?:usa|usan))/i;
const INACTIVE_PATTERN = /^(?:Inactive|Inativo|Inactivo)$/im;

const METADATA_LINE =
  /^(?:Active|Ativo|Activo|Inactive|Inativo|Inactivo|Sponsored|Patrocinado|Publicidade|See ad details|Ver detalhes do anúncio|Ver los detalles del anuncio|See summary details|Platforms|Plataformas|Open Dropdown|This ad has multiple versions|Este anúncio tem várias versões|Este anuncio tiene varias versiones|\d+\s+(?:ads?|anúncios?|anuncios?).*)$/i;

const CTA_LINE =
  /^(?:Shop now|Shop Now|Learn more|Learn More|Sign up|Order now|Get offer|Buy now|Comprar agora|Comprar|Saiba mais|Saber mais|Encomendar agora|Obter oferta|Registar|Inscrever-se|Comprar ahora|Más información|Ver más)$/i;

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, janeiro: 1, january: 1, ene: 1, enero: 1,
  feb: 2, fev: 2, fevereiro: 2, february: 2, febrero: 2,
  mar: 3, março: 3, marco: 3, march: 3, marzo: 3,
  apr: 4, abr: 4, abril: 4, april: 4,
  may: 5, mai: 5, maio: 5, mayo: 5,
  jun: 6, junho: 6, june: 6, junio: 6,
  jul: 7, julho: 7, july: 7, julio: 7,
  aug: 8, ago: 8, agosto: 8, august: 8,
  sep: 9, sept: 9, set: 9, setembro: 9, september: 9, septiembre: 9,
  oct: 10, out: 10, outubro: 10, october: 10, octubre: 10,
  nov: 11, novembro: 11, november: 11, noviembre: 11,
  dec: 12, dez: 12, dezembro: 12, december: 12, dic: 12, diciembre: 12,
};

function iso(year: number, month: number, day: number): string | null {
  if (!(year >= 2004 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null;
  return d.toISOString().slice(0, 10);
}

function monthFrom(word: string): number | null {
  const key = word.toLowerCase().replace(/\./g, "").normalize("NFC");
  return MONTHS[key] ?? MONTHS[key.slice(0, 3)] ?? null;
}

/**
 * Datas da Ad Library: "12 Mar 2026", "Mar 12, 2026", "12 de mar. de 2026",
 * "12 de março de 2026", "12/03/2026" (dia/mês) e "2026-03-12".
 */
export function parseLibraryDate(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, " ");
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(value);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})(?:\s+de)?\s+([A-Za-zÀ-ÿ.]+)(?:\s+de)?,?\s+(\d{4})/.exec(value);
  if (m) {
    const month = monthFrom(m[2] ?? "");
    return month ? iso(Number(m[3]), month, Number(m[1])) : null;
  }
  m = /^([A-Za-zÀ-ÿ.]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(value);
  if (m) {
    const month = monthFrom(m[1] ?? "");
    return month ? iso(Number(m[3]), month, Number(m[2])) : null;
  }
  return null;
}

/** Destino real de links da Meta (l.facebook.com/l.php?u=…) ou link direto. */
export function resolveLandingUrl(links: readonly string[]): string | null {
  for (const href of links) {
    try {
      const url = new URL(href);
      const host = url.hostname.toLowerCase();
      if (host.endsWith("facebook.com") && url.pathname.startsWith("/l.php")) {
        const target = url.searchParams.get("u");
        if (target && /^https?:\/\//i.test(target)) {
          const t = new URL(target);
          t.search = "";
          return t.toString();
        }
        continue;
      }
      if (/(^|\.)(facebook|fb|instagram|messenger|meta|fbcdn)\.(com|net|me)$/.test(host)) continue;
      if (url.protocol === "https:" || url.protocol === "http:") {
        url.search = "";
        return url.toString();
      }
    } catch {
      continue;
    }
  }
  return null;
}

function safeHttps(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Interpreta um cartão. Devolve null se não encontrar o ID da biblioteca. */
export function parseLibraryCard(card: RawLibraryCard): ParsedLibraryAd | null {
  const text = card.text.replace(/\r/g, "");
  const id = ID_PATTERN.exec(text)?.[1];
  if (!id) return null;

  const startRaw = START_PATTERN.exec(text)?.[1] ?? null;
  const copiesRaw = COPIES_PATTERN.exec(text)?.[1];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const content = lines.filter((l) => !ID_PATTERN.test(l) && !START_PATTERN.test(l) && !METADATA_LINE.test(l) && l !== "·");
  // A primeira linha de conteúdo é normalmente o nome da página.
  const pageName = content[0] && content[0].length <= 80 ? content[0] : null;
  const body = content.slice(pageName ? 1 : 0);

  const ctaIndex = body.findIndex((l) => CTA_LINE.test(l));
  let headline: string | null = null;
  if (ctaIndex > 0) {
    const candidate = body[ctaIndex - 1];
    if (candidate && candidate.length <= 140 && !/^[A-Z0-9.-]+\.[A-Z]{2,}$/.test(candidate)) headline = candidate;
  }
  const domainLine = body.find((l) => /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(l) && l.length <= 60);
  const captionCandidates = body.filter((l) => l !== headline && !CTA_LINE.test(l) && l !== domainLine);
  const caption = captionCandidates.sort((a, b) => b.length - a.length)[0] ?? null;

  return {
    adArchiveId: id,
    pageName,
    caption: caption ? caption.slice(0, 5000) : null,
    headline,
    startDate: startRaw ? parseLibraryDate(startRaw) : null,
    copies: copiesRaw ? Math.max(1, Math.min(1000, Number.parseInt(copiesRaw, 10))) : 1,
    landingUrl: resolveLandingUrl(card.links) ?? (domainLine ? `https://${domainLine.toLowerCase()}` : null),
    videoUrl: safeHttps(card.videoUrl),
    thumbnailUrl: safeHttps(card.posterUrl) ?? safeHttps(card.imageUrl),
    isActive: !INACTIVE_PATTERN.test(text),
  };
}

/** Extrai o Page ID do URL da Ad Library (view_all_page_id). */
export function pageIdFromLibraryUrl(url: string): string | null {
  try {
    const v = new URL(url).searchParams.get("view_all_page_id");
    return v && /^\d{5,25}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
