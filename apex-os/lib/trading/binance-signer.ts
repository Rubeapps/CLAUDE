import { createHmac } from "node:crypto";
import { z } from "zod";

/**
 * Binance Spot REST API — pedidos assinados (HMAC-SHA256).
 * Docs: https://developers.binance.com/docs/binance-spot-api-docs/rest-api
 * Testnet: https://testnet.binance.vision (chaves geradas em testnet.binance.vision, fundos fictícios).
 */

export const BINANCE_LIVE_URL = "https://api.binance.com";
export const BINANCE_TESTNET_URL = "https://testnet.binance.vision";

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  isTestnet?: boolean;
}

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";

export interface BinanceOrderData {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  /** Obrigatório para LIMIT. */
  price?: number;
}

/** Mensagens legíveis para os erros Binance mais comuns. */
const BINANCE_ERROR_HINTS: Readonly<Record<number, string>> = {
  [-1013]: "A ordem não cumpre os filtros do símbolo (tamanho de lote, preço ou valor mínimo).",
  [-1021]: "Relógio dessincronizado com a Binance (timestamp fora da janela).",
  [-1022]: "Assinatura inválida: confirma a API Secret.",
  [-1100]: "Parâmetro com caracteres inválidos.",
  [-1111]: "Precisão inválida: demasiadas casas decimais na quantidade ou no preço.",
  [-1121]: "Símbolo inválido.",
  [-2010]: "Ordem rejeitada: saldo insuficiente ou ordem inválida para o mercado atual.",
  [-2011]: "Não há ordem para cancelar.",
  [-2014]: "Formato da API Key inválido.",
  [-2015]: "API Key inválida, sem permissão de trading ou IP não autorizado.",
};

export class BinanceApiError extends Error {
  readonly status: number;
  readonly code: number | null;

  constructor(message: string, status: number, code: number | null) {
    super(message);
    this.name = "BinanceApiError";
    this.status = status;
    this.code = code;
  }
}

const binanceErrorSchema = z.object({ code: z.number(), msg: z.string() });

/** HMAC-SHA256 (hex) da query string com a API Secret — parâmetro `signature` da Binance. */
export function signBinanceQuery(queryString: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(queryString).digest("hex");
}

function baseUrl(isTestnet: boolean | undefined): string {
  return isTestnet === false ? BINANCE_LIVE_URL : BINANCE_TESTNET_URL;
}

/** Converte números para string sem notação científica (a Binance rejeita "1e-7"). */
export function toBinanceDecimal(value: number, maxDecimals = 8): string {
  if (!Number.isFinite(value)) throw new Error("Valor numérico inválido.");
  return value.toFixed(maxDecimals).replace(/\.?0+$/, "") || "0";
}

async function parseOrThrow<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const err = binanceErrorSchema.safeParse(json);
    if (err.success) {
      const hint = BINANCE_ERROR_HINTS[err.data.code];
      throw new BinanceApiError(hint ? `${hint} (Binance ${err.data.code}: ${err.data.msg})` : `Binance ${err.data.code}: ${err.data.msg}`, response.status, err.data.code);
    }
    throw new BinanceApiError(`Binance HTTP ${response.status}`, response.status, null);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new BinanceApiError("Resposta da Binance com formato inesperado.", 502, null);
  return parsed.data;
}

/** Pedido assinado: todos os parâmetros vão na query string (a assinatura cobre-os todos). */
async function signedRequest<T>(
  credentials: BinanceCredentials,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<T> {
  const query = new URLSearchParams({ ...params, recvWindow: "5000", timestamp: String(Date.now()) }).toString();
  const signature = signBinanceQuery(query, credentials.apiSecret);
  const response = await fetch(`${baseUrl(credentials.isTestnet)}${path}?${query}&signature=${signature}`, {
    method,
    headers: { "X-MBX-APIKEY": credentials.apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  return parseOrThrow(response, schema);
}

/* ─── Filtros do símbolo (exchangeInfo, público) ──────────────────────────── */

const filterSchema = z.object({ filterType: z.string() }).passthrough();
const exchangeInfoSchema = z.object({
  symbols: z.array(
    z.object({
      symbol: z.string(),
      status: z.string(),
      baseAsset: z.string(),
      quoteAsset: z.string(),
      filters: z.array(filterSchema),
    }),
  ),
});

export interface SymbolFilters {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  stepSize: number;
  minQty: number;
  maxQty: number;
  tickSize: number;
  minNotional: number;
}

function numField(filter: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const raw = filter?.[key];
  const n = typeof raw === "string" ? Number.parseFloat(raw) : typeof raw === "number" ? raw : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function getSymbolFilters(symbol: string, isTestnet?: boolean): Promise<SymbolFilters> {
  const response = await fetch(`${baseUrl(isTestnet)}/api/v3/exchangeInfo?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const info = await parseOrThrow(response, exchangeInfoSchema);
  const s = info.symbols[0];
  if (!s) throw new BinanceApiError(`Símbolo ${symbol} não encontrado.`, 400, -1121);
  if (s.status !== "TRADING") throw new BinanceApiError(`O símbolo ${symbol} não está em negociação (${s.status}).`, 400, null);
  const byType = (t: string) => s.filters.find((f) => f.filterType === t) as Record<string, unknown> | undefined;
  const lot = byType("LOT_SIZE");
  const price = byType("PRICE_FILTER");
  const notional = byType("NOTIONAL") ?? byType("MIN_NOTIONAL");
  return {
    symbol: s.symbol,
    baseAsset: s.baseAsset,
    quoteAsset: s.quoteAsset,
    stepSize: numField(lot, "stepSize", 0.00000001),
    minQty: numField(lot, "minQty", 0),
    maxQty: numField(lot, "maxQty", Number.MAX_SAFE_INTEGER),
    tickSize: numField(price, "tickSize", 0.00000001),
    minNotional: numField(notional, "minNotional", 0),
  };
}

function decimalsOf(step: number): number {
  const s = toBinanceDecimal(step, 10);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** Arredonda para baixo ao múltiplo do step (LOT_SIZE / PRICE_FILTER). */
export function floorToStep(value: number, step: number): number {
  if (!(step > 0)) return value;
  const decimals = decimalsOf(step);
  const floored = Math.floor(value / step + 1e-9) * step;
  return Number(floored.toFixed(decimals));
}

/* ─── Ordens ──────────────────────────────────────────────────────────────── */

const fillSchema = z.object({ price: z.string(), qty: z.string(), commission: z.string(), commissionAsset: z.string() });
const orderResponseSchema = z.object({
  symbol: z.string(),
  orderId: z.number(),
  clientOrderId: z.string(),
  status: z.string(),
  executedQty: z.string(),
  cummulativeQuoteQty: z.string(),
  fills: z.array(fillSchema).optional(),
});

export interface ExecutedOrder {
  orderId: number;
  status: string;
  executedQty: number;
  quoteQty: number;
  /** Preço médio de execução (0 se ainda não executada, ex.: LIMIT aberta). */
  avgPrice: number;
  /** Comissões cobradas no ativo base (reduzem a quantidade realmente recebida). */
  baseCommission: number;
  raw: z.infer<typeof orderResponseSchema>;
}

/** POST /api/v3/order (MARKET ou LIMIT GTC), com resposta FULL. */
export async function executeBinanceOrder(credentials: BinanceCredentials, orderData: BinanceOrderData, baseAsset?: string): Promise<ExecutedOrder> {
  if (!/^[A-Z0-9]{5,20}$/.test(orderData.symbol)) throw new BinanceApiError("Símbolo inválido.", 400, -1121);
  if (!(orderData.quantity > 0)) throw new BinanceApiError("A quantidade tem de ser maior que zero.", 400, null);
  if (orderData.type === "LIMIT" && !(orderData.price !== undefined && orderData.price > 0)) {
    throw new BinanceApiError("Ordens LIMIT precisam de preço.", 400, null);
  }

  const params: Record<string, string> = {
    symbol: orderData.symbol,
    side: orderData.side,
    type: orderData.type,
    quantity: toBinanceDecimal(orderData.quantity),
    newOrderRespType: "FULL",
  };
  if (orderData.type === "LIMIT" && orderData.price !== undefined) {
    params.price = toBinanceDecimal(orderData.price);
    params.timeInForce = "GTC";
  }

  const raw = await signedRequest(credentials, "POST", "/api/v3/order", params, orderResponseSchema);
  const executedQty = Number.parseFloat(raw.executedQty);
  const quoteQty = Number.parseFloat(raw.cummulativeQuoteQty);
  const baseCommission = (raw.fills ?? []).filter((f) => baseAsset !== undefined && f.commissionAsset === baseAsset).reduce((sum, f) => sum + Number.parseFloat(f.commission), 0);
  return {
    orderId: raw.orderId,
    status: raw.status,
    executedQty,
    quoteQty,
    avgPrice: executedQty > 0 ? quoteQty / executedQty : 0,
    baseCommission,
    raw,
  };
}

const ocoResponseSchema = z.object({ orderListId: z.number(), listStatusType: z.string() }).passthrough();

/**
 * OCO de proteção para uma posição long spot: vende a quantidade no take profit (LIMIT_MAKER)
 * ou no stop loss (STOP_LOSS_LIMIT com limite 0.3% abaixo do stop para garantir execução).
 * POST /api/v3/orderList/oco
 */
export async function placeProtectiveOco(
  credentials: BinanceCredentials,
  params: { symbol: string; quantity: number; takeProfit: number; stopLoss: number; tickSize: number },
): Promise<{ orderListId: number }> {
  const tp = floorToStep(params.takeProfit, params.tickSize);
  const stop = floorToStep(params.stopLoss, params.tickSize);
  const stopLimit = floorToStep(params.stopLoss * 0.997, params.tickSize);
  const raw = await signedRequest(
    credentials,
    "POST",
    "/api/v3/orderList/oco",
    {
      symbol: params.symbol,
      side: "SELL",
      quantity: toBinanceDecimal(params.quantity),
      aboveType: "LIMIT_MAKER",
      abovePrice: toBinanceDecimal(tp),
      belowType: "STOP_LOSS_LIMIT",
      belowStopPrice: toBinanceDecimal(stop),
      belowPrice: toBinanceDecimal(stopLimit),
      belowTimeInForce: "GTC",
    },
    ocoResponseSchema,
  );
  return { orderListId: raw.orderListId };
}

/** Cancela todas as ordens abertas do símbolo. Sem ordens abertas não é erro. */
export async function cancelOpenOrders(credentials: BinanceCredentials, symbol: string): Promise<number> {
  try {
    const result = await signedRequest(credentials, "DELETE", "/api/v3/openOrders", { symbol }, z.array(z.unknown()));
    return result.length;
  } catch (error) {
    if (error instanceof BinanceApiError && error.code === -2011) return 0;
    throw error;
  }
}

const accountSchema = z.object({ balances: z.array(z.object({ asset: z.string(), free: z.string(), locked: z.string() })) });

/** Saldo livre de um ativo (GET /api/v3/account). */
export async function getFreeBalance(credentials: BinanceCredentials, asset: string): Promise<number> {
  const account = await signedRequest(credentials, "GET", "/api/v3/account", { omitZeroBalances: "true" }, accountSchema);
  const balance = account.balances.find((b) => b.asset === asset);
  return balance ? Number.parseFloat(balance.free) : 0;
}
