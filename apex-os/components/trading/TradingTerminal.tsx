"use client";

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { DEFAULT_SYMBOLS, isValidSymbol } from "@/lib/binance";
import type { TradingAccountRow, TradingJournalRow } from "@/lib/database.types";
import { RiskCalculator } from "./RiskCalculator";
import { TradingChart, type ChartPriceLine } from "./TradingChart";

export function TradingTerminal({ account, openTrades }: { account: TradingAccountRow | null; openTrades: TradingJournalRow[] }) {
  const [symbol, setSymbol] = useState<string>(DEFAULT_SYMBOLS[0]);
  const [custom, setCustom] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);

  const handlePrice = useCallback((price: number) => setLivePrice(price), []);

  const priceLines = useMemo<ChartPriceLine[]>(
    () =>
      openTrades
        .filter((t) => t.symbol === symbol)
        .flatMap((t) => [
          { id: `${t.id}-e`, price: t.entry_price, color: "#60a5fa", title: `${t.direction} entrada` },
          { id: `${t.id}-sl`, price: t.stop_loss, color: "#ef4444", title: "SL" },
          { id: `${t.id}-tp`, price: t.take_profit, color: "#22c55e", title: "TP" },
        ]),
    [openTrades, symbol],
  );

  const changeSymbol = (next: string) => {
    setLivePrice(null);
    setSymbol(next);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Terminal</CardTitle>
            <CardDescription>Binance spot · velas de 1 minuto em streaming</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={DEFAULT_SYMBOLS.includes(symbol as (typeof DEFAULT_SYMBOLS)[number]) ? symbol : ""} onChange={(e) => e.target.value && changeSymbol(e.target.value)} className="w-32" aria-label="Símbolo">
              {!DEFAULT_SYMBOLS.includes(symbol as (typeof DEFAULT_SYMBOLS)[number]) ? <option value="">{symbol}</option> : null}
              {DEFAULT_SYMBOLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const next = custom.trim().toUpperCase();
                if (isValidSymbol(next)) {
                  changeSymbol(next);
                  setCustom("");
                }
              }}
            >
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Outro (ex.: AVAXUSDT)" className="w-44" aria-label="Símbolo personalizado" />
            </form>
          </div>
        </CardHeader>
        <CardContent>
          <TradingChart symbol={symbol} priceLines={priceLines} onPrice={handlePrice} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Calculadora de risco</CardTitle>
          <CardDescription>Posição = (Saldo × Risco%) / Distância do SL</CardDescription>
        </CardHeader>
        <CardContent>
          <RiskCalculator account={account} symbol={symbol} livePrice={livePrice} />
        </CardContent>
      </Card>
    </div>
  );
}
