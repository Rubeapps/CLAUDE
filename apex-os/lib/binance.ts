import { z } from "zod";

/**
 * Binance public market data (sem chave). Endpoints "market data only" com CORS:
 * REST: https://data-api.binance.vision  ·  WS: wss://stream.binance.com:9443 (fallback data-stream.binance.vision)
 */

export const BINANCE_REST_BASES = ["https://data-api.binance.vision", "https://api.binance.com"] as const;
export const BINANCE_WS_BASES = ["wss://stream.binance.com:9443/ws", "wss://data-stream.binance.vision/ws"] as const;

export const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT"] as const;

export interface Candle {
  /** Segundos UNIX (UTCTimestamp do lightweight-charts). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
}

const num = z.union([z.string(), z.number()]).transform((v) => Number(v));

/** [openTime, open, high, low, close, volume, closeTime, ...] */
const restKlineSchema = z.tuple([z.number(), num, num, num, num, num, z.number()]).rest(z.unknown());
export const restKlinesSchema = z.array(restKlineSchema);

export const wsKlineMessageSchema = z.object({
  e: z.literal("kline"),
  s: z.string(),
  k: z.object({
    t: z.number(),
    o: num,
    h: num,
    l: num,
    c: num,
    v: num,
    x: z.boolean(),
  }),
});

export function isValidSymbol(symbol: string): boolean {
  return /^[A-Z0-9]{5,20}$/.test(symbol);
}

export async function fetchKlines(symbol: string, interval = "1m", limit = 500): Promise<Candle[]> {
  let lastError: unknown = null;
  for (const base of BINANCE_REST_BASES) {
    try {
      const res = await fetch(`${base}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`, { cache: "no-store" });
      if (res.status === 400) throw new Error(`Símbolo ${symbol} não existe na Binance.`);
      if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
      const parsed = restKlinesSchema.safeParse(await res.json());
      if (!parsed.success) throw new Error("Resposta de klines inválida.");
      return parsed.data.map(([openTime, open, high, low, close, volume, closeTime]) => ({
        time: Math.floor(openTime / 1000),
        open,
        high,
        low,
        close,
        volume,
        closed: closeTime < Date.now(),
      }));
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message.includes("não existe")) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Falha ao obter velas da Binance.");
}

/** Casas decimais adequadas ao preço (BTC 2, altcoins baratas 5-6). */
export function pricePrecision(price: number): number {
  if (price >= 1000) return 2;
  if (price >= 10) return 3;
  if (price >= 1) return 4;
  if (price >= 0.01) return 5;
  return 8;
}
