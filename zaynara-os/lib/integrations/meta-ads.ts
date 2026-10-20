import "server-only";
import { env } from "@/lib/env";
import type { DailyAdSpend } from "@/lib/finance/metrics";

export class MetaNotConfigured extends Error {
  constructor() {
    super("Meta Ads não configurado: define META_ACCESS_TOKEN e META_AD_ACCOUNT_ID.");
  }
}

interface InsightsPage {
  data: { spend: string; date_start: string; account_currency?: string }[];
  paging?: { next?: string };
  error?: { message: string };
}

/** Gasto diário da conta de anúncios (Insights API, nível conta, 1 linha por dia). */
export async function fetchDailyAdSpend(from: string, to: string): Promise<DailyAdSpend[]> {
  const e = env();
  if (!e.META_ACCESS_TOKEN || !e.META_AD_ACCOUNT_ID) throw new MetaNotConfigured();

  const account = e.META_AD_ACCOUNT_ID.startsWith("act_") ? e.META_AD_ACCOUNT_ID : `act_${e.META_AD_ACCOUNT_ID}`;
  const url = new URL(`https://graph.facebook.com/${e.META_API_VERSION}/${account}/insights`);
  url.searchParams.set("level", "account");
  url.searchParams.set("fields", "spend,account_currency");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: from, until: to }));
  url.searchParams.set("limit", "100");

  const result: DailyAdSpend[] = [];
  let next: string | undefined = url.toString();

  for (let page = 0; next && page < 20; page++) {
    const res: Response = await fetch(next, {
      headers: { Authorization: `Bearer ${e.META_ACCESS_TOKEN}` },
      cache: "no-store",
    });
    const json = (await res.json()) as InsightsPage;
    if (!res.ok || json.error) throw new Error(`Meta Ads: ${json.error?.message ?? res.status}`);

    for (const row of json.data) {
      if (row.account_currency && row.account_currency !== "EUR") {
        throw new Error(`Meta Ads: conta em ${row.account_currency}; só EUR é suportado por agora.`);
      }
      result.push({ date: row.date_start, spend: Number(row.spend) });
    }
    next = json.paging?.next;
  }

  return result;
}
