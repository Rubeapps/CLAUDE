import "server-only";
import { env } from "@/lib/env";

export interface FxRates {
  toEur: Record<string, number>;
  /** true quando a API falhou e foi usada a taxa de reserva do .env. */
  fallback: boolean;
  date: string | null;
}

/**
 * Taxas de câmbio do BCE via Frankfurter (grátis, sem chave), em cache 12 h.
 * Só precisamos de USD → EUR (custo das meias).
 */
export async function getFxRates(): Promise<FxRates> {
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR", {
      next: { revalidate: 43_200 },
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { date: string; rates: { EUR: number } };
    return { toEur: { EUR: 1, USD: json.rates.EUR }, fallback: false, date: json.date };
  } catch {
    return { toEur: { EUR: 1, USD: env().FX_USD_EUR_FALLBACK }, fallback: true, date: null };
  }
}
