import "server-only";
import { env } from "@/lib/env";
import type { NormalizedOrder } from "@/lib/finance/metrics";

// Cliente mínimo da Shopify Admin GraphQL API (só leitura).
// Scopes: read_orders, read_products, read_inventory.

let cachedToken: { value: string; expiresAt: number } | undefined;

/**
 * Token estático (app personalizada antiga) ou, para apps criadas no Dev
 * Dashboard, o grant `client_credentials` (token de ~24 h, guardado em memória).
 */
async function accessToken(): Promise<string> {
  const e = env();
  if (e.SHOPIFY_ADMIN_ACCESS_TOKEN) return e.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!e.SHOPIFY_STORE_DOMAIN || !e.SHOPIFY_CLIENT_ID || !e.SHOPIFY_CLIENT_SECRET) {
    throw new ShopifyNotConfigured();
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const res = await fetch(`https://${e.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: e.SHOPIFY_CLIENT_ID,
      client_secret: e.SHOPIFY_CLIENT_SECRET,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Shopify: falhou a obtenção do token (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

export class ShopifyNotConfigured extends Error {
  constructor() {
    super("Shopify não configurada: define SHOPIFY_STORE_DOMAIN e o token (ou client id/secret).");
  }
}

async function shopifyGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const e = env();
  if (!e.SHOPIFY_STORE_DOMAIN) throw new ShopifyNotConfigured();
  const token = await accessToken();

  const res = await fetch(
    `https://${e.SHOPIFY_STORE_DOMAIN}/admin/api/${e.SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Shopify respondeu ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`Shopify: ${json.errors.map((x) => x.message).join("; ")}`);
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Encomendas
// ---------------------------------------------------------------------------

const ORDERS_QUERY = /* GraphQL */ `
  query Orders($q: String!, $after: String) {
    orders(first: 50, after: $after, query: $q, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        cancelledAt
        test
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        currentTotalTaxSet { shopMoney { amount } }
        shippingAddress { countryCodeV2 }
        lineItems(first: 10) { nodes { title quantity product { id } } }
        transactions(first: 5) {
          kind
          status
          gateway
          amountSet { shopMoney { amount } }
          fees { amount { amount } taxAmount { amount } }
        }
      }
    }
  }
`;

interface Money {
  amount: string;
}

interface OrdersResponse {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      id: string;
      name: string;
      createdAt: string;
      cancelledAt: string | null;
      test: boolean;
      currentTotalPriceSet: { shopMoney: Money & { currencyCode: string } };
      currentTotalTaxSet: { shopMoney: Money } | null;
      shippingAddress: { countryCodeV2: string | null } | null;
      lineItems: { nodes: { title: string; quantity: number; product: { id: string } | null }[] };
      transactions: {
        kind: string;
        status: string;
        gateway: string | null;
        amountSet: { shopMoney: Money };
        fees: { amount: Money; taxAmount: Money }[];
      }[];
    }[];
  };
}

/** "2026-10-20T23:30:00Z" → "2026-10-21" em Europe/Lisbon (formato en-CA = ISO). */
export function toLocalDate(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

const MAX_PAGES = 40; // 2 000 encomendas por pedido ao Dashboard

/** Encomendas não canceladas e não-teste criadas entre from e to (datas locais). */
export async function fetchOrders(from: string, to: string): Promise<NormalizedOrder[]> {
  const e = env();
  // Margem de 1 dia nos limites UTC; o filtro exato é feito na data local.
  const q = `created_at:>=${shiftDate(from, -1)} AND created_at:<=${shiftDate(to, 1)}`;

  const orders: NormalizedOrder[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: OrdersResponse = await shopifyGraphql<OrdersResponse>(ORDERS_QUERY, { q, after });
    for (const node of data.orders.nodes) {
      if (node.cancelledAt || node.test) continue;
      const date = toLocalDate(node.createdAt, e.APP_TIMEZONE);
      if (date < from || date > to) continue;

      let gatewayFees = 0;
      let gatewayFeesTax = 0;
      for (const tx of node.transactions) {
        if (tx.status !== "SUCCESS" || (tx.kind !== "SALE" && tx.kind !== "CAPTURE")) continue;
        if (tx.fees.length > 0) {
          for (const fee of tx.fees) {
            gatewayFees += Number(fee.amount.amount);
            gatewayFeesTax += Number(fee.taxAmount.amount);
          }
        } else if (tx.gateway && tx.gateway !== "shopify_payments" && tx.gateway !== "manual") {
          // Outros gateways (ex: PayPal) não reportam taxas à Shopify: estimativa do .env.
          const amount = Number(tx.amountSet.shopMoney.amount);
          gatewayFees += (amount * e.GATEWAY_FEE_PERCENT) / 100 + e.GATEWAY_FEE_FIXED;
        }
      }

      orders.push({
        id: node.id,
        name: node.name,
        date,
        country: node.shippingAddress?.countryCodeV2 ?? null,
        grossRevenue: Number(node.currentTotalPriceSet.shopMoney.amount),
        tax: Number(node.currentTotalTaxSet?.shopMoney.amount ?? 0),
        gatewayFees,
        gatewayFeesTax,
        lines: node.lineItems.nodes.map((l) => ({
          shopifyProductId: l.product?.id ?? null,
          title: l.title,
          quantity: l.quantity,
        })),
      });
    }
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }

  return orders;
}

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Inventário e produtos
// ---------------------------------------------------------------------------

export interface LowStockVariant {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
}

const LOW_STOCK_QUERY = /* GraphQL */ `
  query LowStock($q: String!) {
    productVariants(first: 100, query: $q) {
      nodes {
        id
        displayName
        sku
        inventoryQuantity
        inventoryItem { tracked }
      }
    }
  }
`;

export async function fetchLowStock(threshold: number): Promise<LowStockVariant[]> {
  const data = await shopifyGraphql<{
    productVariants: {
      nodes: {
        id: string;
        displayName: string;
        sku: string | null;
        inventoryQuantity: number | null;
        inventoryItem: { tracked: boolean };
      }[];
    };
  }>(LOW_STOCK_QUERY, { q: `inventory_quantity:<${threshold} AND product_status:ACTIVE` });

  return data.productVariants.nodes
    .filter((v) => v.inventoryItem.tracked && v.inventoryQuantity !== null)
    .map((v) => ({ id: v.id, name: v.displayName, sku: v.sku, quantity: v.inventoryQuantity! }))
    .sort((a, b) => a.quantity - b.quantity);
}

export interface ShopifyProduct {
  id: string;
  title: string;
  status: string;
}

export async function fetchProducts(): Promise<ShopifyProduct[]> {
  const data = await shopifyGraphql<{ products: { nodes: ShopifyProduct[] } }>(
    /* GraphQL */ `
      query Products {
        products(first: 100, query: "status:active OR status:draft", sortKey: TITLE) {
          nodes { id title status }
        }
      }
    `,
    {},
  );
  return data.products.nodes;
}
