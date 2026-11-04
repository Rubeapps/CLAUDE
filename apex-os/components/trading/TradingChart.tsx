"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Loader2, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BINANCE_WS_BASES, fetchKlines, pricePrecision, wsKlineMessageSchema, type Candle } from "@/lib/binance";
import { cn } from "@/lib/utils";

export interface ChartPriceLine {
  id: string;
  price: number;
  color: string;
  title: string;
}

type ConnectionState = "loading" | "live" | "reconnecting" | "error";

const UP = "#22c55e";
const DOWN = "#ef4444";

function toCandle(c: Candle): CandlestickData<UTCTimestamp> {
  return { time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close };
}

function toVolume(c: Candle): HistogramData<UTCTimestamp> {
  return { time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)" };
}

/**
 * Candlesticks 1m em tempo real: histórico via REST /api/v3/klines e streaming via WebSocket <symbol>@kline_1m.
 * Reconexão automática com backoff exponencial e alternância entre endpoints públicos.
 */
export function TradingChart({ symbol, height = 460, priceLines = [], onPrice }: { symbol: string; height?: number; priceLines?: ChartPriceLine[]; onPrice?: (price: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const onPriceRef = useRef(onPrice);
  const [state, setState] = useState<ConnectionState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ price: number; changePct: number; precision: number } | null>(null);

  useEffect(() => {
    onPriceRef.current = onPrice;
  }, [onPrice]);

  // Cria o gráfico uma vez.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#94a3b8", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: "rgba(148,163,184,0.06)" }, horzLines: { color: "rgba(148,163,184,0.06)" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true, secondsVisible: false },
    });
    const candles = chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN });
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });

    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      linesRef.current = [];
    };
  }, []);

  // Histórico + WebSocket por símbolo.
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let dayOpen: number | null = null;

    const applyCandle = (c: Candle) => {
      candleRef.current?.update(toCandle(c));
      volumeRef.current?.update(toVolume(c));
      const ref = dayOpen ?? c.open;
      setLast({ price: c.close, changePct: ref > 0 ? ((c.close - ref) / ref) * 100 : 0, precision: pricePrecision(c.close) });
      onPriceRef.current?.(c.close);
    };

    const connect = () => {
      if (disposed) return;
      const base = BINANCE_WS_BASES[attempt % BINANCE_WS_BASES.length] ?? BINANCE_WS_BASES[0];
      socket = new WebSocket(`${base}/${symbol.toLowerCase()}@kline_1m`);
      socket.onopen = () => {
        attempt = 0;
        setState("live");
        setError(null);
      };
      socket.onmessage = (event: MessageEvent<string>) => {
        let json: unknown;
        try {
          json = JSON.parse(event.data);
        } catch {
          return;
        }
        const parsed = wsKlineMessageSchema.safeParse(json);
        if (!parsed.success) return;
        const k = parsed.data.k;
        applyCandle({ time: Math.floor(k.t / 1000), open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v, closed: k.x });
      };
      socket.onclose = () => {
        if (disposed) return;
        setState("reconnecting");
        attempt += 1;
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
        retryTimer = setTimeout(connect, delay);
      };
      socket.onerror = () => {
        socket?.close();
      };
    };

    const load = async () => {
      setState("loading");
      setError(null);
      setLast(null);
      try {
        const history = await fetchKlines(symbol, "1m", 1000);
        if (disposed) return;
        const precision = pricePrecision(history[history.length - 1]?.close ?? 1);
        candleRef.current?.applyOptions({ priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
        candleRef.current?.setData(history.map(toCandle));
        volumeRef.current?.setData(history.map(toVolume));
        // Referência para a variação: abertura de ~24h atrás (1440 velas) ou a mais antiga disponível.
        dayOpen = history[Math.max(0, history.length - 1440)]?.open ?? null;
        const lastCandle = history[history.length - 1];
        if (lastCandle) applyCandle(lastCandle);
        chartRef.current?.timeScale().scrollToRealTime();
        connect();
      } catch (e) {
        if (disposed) return;
        setState("error");
        setError(e instanceof Error ? e.message : "Falha ao carregar dados.");
      }
    };

    void load();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [symbol]);

  // Linhas de entrada/SL/TP dos trades abertos.
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    for (const line of linesRef.current) series.removePriceLine(line);
    linesRef.current = priceLines.map((l) =>
      series.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: l.title }),
    );
  }, [priceLines]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-semibold">{symbol}</span>
          {last ? (
            <>
              <span className="font-mono text-lg font-semibold tabular-nums">{last.price.toFixed(last.precision)}</span>
              <span className={cn("font-mono text-xs tabular-nums", last.changePct >= 0 ? "text-success" : "text-destructive")}>
                {last.changePct >= 0 ? "+" : ""}
                {last.changePct.toFixed(2)}%
              </span>
            </>
          ) : null}
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs",
            state === "live" && "text-success",
            state === "reconnecting" && "text-amber-400",
            state === "error" && "text-destructive",
            state === "loading" && "text-muted-foreground",
          )}
        >
          {state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : state === "live" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {state === "live" ? "1m live" : state === "reconnecting" ? "a reconectar…" : state === "error" ? "erro" : "a carregar…"}
        </span>
      </div>
      <div className="relative" style={{ height }}>
        <div ref={containerRef} className="absolute inset-0" />
        {error ? <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive">{error}</div> : null}
      </div>
    </div>
  );
}
