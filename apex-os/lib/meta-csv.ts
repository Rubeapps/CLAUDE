/**
 * Parser de exportações CSV do Meta Ads Manager (EN e PT), sem dependências.
 * Colunas reconhecidas: Campaign Name, Ad Name, Amount Spent, Impressions,
 * 3-Second Video Plays, ThruPlays, Frequency, CTR, Cost per Result (+ Reporting Starts / Day).
 */

export interface MetaAdRow {
  campaignName: string;
  adName: string;
  spend: number;
  impressions: number;
  videoPlays3s: number;
  thruplays: number;
  frequency: number;
  /** CTR em % (1.25 = 1.25%). */
  ctr: number;
  cpa: number;
  /** YYYY-MM-DD se o CSV tiver coluna de data. */
  date: string | null;
}

export type MetaColumn = "campaignName" | "adName" | "spend" | "impressions" | "videoPlays3s" | "thruplays" | "frequency" | "ctr" | "cpa" | "date";

export interface MetaCsvResult {
  rows: MetaAdRow[];
  /** Colunas obrigatórias em falta — se não estiver vazio, rows vem vazio. */
  missingRequired: MetaColumn[];
  /** Colunas opcionais em falta (assumidas a 0). */
  missingOptional: MetaColumn[];
  skippedRows: number;
  delimiter: string;
}

const REQUIRED: readonly MetaColumn[] = ["campaignName", "adName", "spend", "impressions"];
const OPTIONAL: readonly MetaColumn[] = ["videoPlays3s", "thruplays", "frequency", "ctr", "cpa", "date"];

/** Prefixos de cabeçalho normalizados (minúsculas, sem acentos, sem "(EUR)" etc.). */
const HEADER_ALIASES: Record<MetaColumn, readonly string[]> = {
  campaignName: ["campaign name", "nome da campanha", "campanha"],
  adName: ["ad name", "nome do anuncio", "anuncio"],
  spend: ["amount spent", "valor gasto", "montante gasto", "quantia gasta", "spend"],
  impressions: ["impressions", "impressoes"],
  videoPlays3s: ["3-second video plays", "3 second video plays", "reproducoes de video de 3 segundos", "visualizacoes de video de 3 segundos", "video plays at 3s"],
  thruplays: ["thruplays", "thruplay"],
  frequency: ["frequency", "frequencia"],
  ctr: ["ctr (link click-through rate)", "ctr (taxa de cliques no link)", "ctr (all)", "ctr (todos)", "ctr"],
  cpa: ["cost per result", "custo por resultado", "cost per purchase", "custo por compra", "cpa"],
  date: ["reporting starts", "inicio dos relatorios", "day", "dia", "date", "data"],
};

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stripParenthetical(header: string): string {
  return header.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** Mapeia cada coluna lógica para o índice do cabeçalho (match exato primeiro, depois prefixo). */
export function mapHeaders(headers: readonly string[]): Partial<Record<MetaColumn, number>> {
  const normalized = headers.map(normalizeHeader);
  const bare = normalized.map(stripParenthetical);
  const result: Partial<Record<MetaColumn, number>> = {};
  const used = new Set<number>();

  for (const column of [...REQUIRED, ...OPTIONAL]) {
    const aliases = HEADER_ALIASES[column];
    let index = -1;
    for (const alias of aliases) {
      index = normalized.findIndex((h, i) => !used.has(i) && (h === alias || bare[i] === alias));
      if (index >= 0) break;
    }
    if (index < 0) {
      for (const alias of aliases) {
        index = normalized.findIndex((h, i) => !used.has(i) && h.startsWith(alias));
        if (index >= 0) break;
      }
    }
    if (index >= 0) {
      result[column] = index;
      used.add(index);
    }
  }
  return result;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let bestCount = -1;
  for (const candidate of [",", ";", "\t"]) {
    let count = 0;
    let quoted = false;
    for (const char of firstLine) {
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === candidate) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Parser RFC 4180: aspas, "" escapado e quebras de linha dentro de aspas. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** Converte "1,234.56", "1.234,56", "12,5", "€ 3.20", "1.8%" em número. Vazio/"-" → 0. */
export function parseLocaleNumber(raw: string | undefined): number {
  if (raw === undefined) return 0;
  const cleaned = raw.trim().replace(/[^\d,.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === "--") return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = /^-?\d{1,3}(,\d{3})+$/.test(cleaned) ? cleaned.replace(/,/g, "") : cleaned.replace(/,/g, ".");
  } else if ((cleaned.match(/\./g) ?? []).length > 1) {
    normalized = cleaned.replace(/\./g, "");
  } else {
    normalized = cleaned;
  }

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

/** Normaliza datas "2026-03-01", "01/03/2026" (dd/mm), "3/1/2026" (m/d se mês > 12 impossível) para YYYY-MM-DD. */
export function parseCsvDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (parts) {
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    // Por omissão dd/mm/aaaa (PT); se o primeiro número não puder ser dia de mês com o segundo > 12, assume mm/dd.
    const [day, month] = b > 12 ? [b, a] : [a, b];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${parts[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

export function parseMetaAdsCsv(input: string): MetaCsvResult {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const table = parseCsv(text, delimiter);
  const [headerRow, ...dataRows] = table;
  if (!headerRow) {
    return { rows: [], missingRequired: [...REQUIRED], missingOptional: [...OPTIONAL], skippedRows: 0, delimiter };
  }

  const map = mapHeaders(headerRow);
  const missingRequired = REQUIRED.filter((c) => map[c] === undefined);
  const missingOptional = OPTIONAL.filter((c) => map[c] === undefined);
  if (missingRequired.length > 0) return { rows: [], missingRequired, missingOptional, skippedRows: dataRows.length, delimiter };

  const cell = (row: readonly string[], column: MetaColumn): string | undefined => {
    const index = map[column];
    return index === undefined ? undefined : row[index];
  };

  const rows: MetaAdRow[] = [];
  let skippedRows = 0;
  for (const row of dataRows) {
    const campaignName = (cell(row, "campaignName") ?? "").trim();
    const adName = (cell(row, "adName") ?? "").trim();
    // Linhas de totais do Meta vêm sem nome de anúncio.
    if (adName.length === 0) {
      skippedRows += 1;
      continue;
    }
    rows.push({
      campaignName: campaignName.length > 0 ? campaignName.slice(0, 300) : "(sem campanha)",
      adName: adName.slice(0, 300),
      spend: clamp(Math.round(parseLocaleNumber(cell(row, "spend")) * 100) / 100, 99_999_999.99),
      impressions: clamp(Math.round(parseLocaleNumber(cell(row, "impressions"))), 2_147_483_647),
      videoPlays3s: clamp(Math.round(parseLocaleNumber(cell(row, "videoPlays3s"))), 2_147_483_647),
      thruplays: clamp(Math.round(parseLocaleNumber(cell(row, "thruplays"))), 2_147_483_647),
      frequency: clamp(Math.round(parseLocaleNumber(cell(row, "frequency")) * 100) / 100, 999.99),
      ctr: clamp(Math.round(parseLocaleNumber(cell(row, "ctr")) * 100) / 100, 999.99),
      cpa: clamp(Math.round(parseLocaleNumber(cell(row, "cpa")) * 100) / 100, 99_999_999.99),
      date: parseCsvDate(cell(row, "date")),
    });
  }

  return { rows, missingRequired, missingOptional, skippedRows, delimiter };
}
