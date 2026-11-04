/**
 * Tipos da base de dados (espelho de supabase/schema.sql).
 * Formato compatível com `supabase gen types typescript`.
 * NUMERIC e BIGINT chegam do PostgREST como `number` em JSON.
 */

export type AdPlatform = "META" | "TIKTOK" | "GOOGLE";
export type TradeDirection = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED" | "CANCELLED";

type TableDef<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export type DropshipProductRow = {
  id: string;
  user_id: string;
  sku: string;
  name: string;
  cogs: number;
  shipping_cost: number;
  created_at: string | null;
}
export type DropshipProductInsert = {
  id?: string;
  user_id: string;
  sku: string;
  name: string;
  cogs?: number;
  shipping_cost?: number;
  created_at?: string | null;
}

export type DropshipOrderRow = {
  id: string;
  user_id: string;
  shopify_order_id: string;
  order_number: string;
  total_price: number;
  currency: string;
  gateway: string;
  gateway_fee: number;
  total_cogs: number;
  total_shipping: number;
  net_profit: number;
  status_financial: string;
  created_at: string | null;
}
export type DropshipOrderInsert = {
  id?: string;
  user_id: string;
  shopify_order_id: string;
  order_number: string;
  total_price: number;
  currency?: string;
  gateway: string;
  gateway_fee?: number;
  total_cogs?: number;
  total_shipping?: number;
  net_profit?: number;
  status_financial: string;
  created_at?: string | null;
}

export type DropshipAdSpendRow = {
  id: string;
  user_id: string;
  date: string;
  platform: AdPlatform;
  amount: number;
  created_at: string | null;
}
export type DropshipAdSpendInsert = {
  id?: string;
  user_id: string;
  date: string;
  platform: AdPlatform;
  amount?: number;
  created_at?: string | null;
}

export type DropshipStoreRow = {
  id: string;
  user_id: string;
  shop_domain: string;
  created_at: string | null;
}
export type DropshipStoreInsert = {
  id?: string;
  user_id: string;
  shop_domain: string;
  created_at?: string | null;
}

export type SpyTargetRow = {
  id: string;
  user_id: string;
  store_name: string;
  store_url: string;
  is_active: boolean;
  last_scraped_at: string | null;
  created_at: string | null;
}
export type SpyTargetInsert = {
  id?: string;
  user_id: string;
  store_name: string;
  store_url: string;
  is_active?: boolean;
  last_scraped_at?: string | null;
  created_at?: string | null;
}

export type SpyTrackedProductRow = {
  id: string;
  target_id: string;
  shopify_product_id: number;
  title: string;
  handle: string;
  current_price: number;
  compare_at_price: number | null;
  is_available: boolean;
  image_url: string | null;
  published_at: string | null;
  last_updated_at: string | null;
}
export type SpyTrackedProductInsert = {
  id?: string;
  target_id: string;
  shopify_product_id: number;
  title: string;
  handle: string;
  current_price: number;
  compare_at_price?: number | null;
  is_available?: boolean;
  image_url?: string | null;
  published_at?: string | null;
  last_updated_at?: string | null;
}

export type SpyPriceHistoryRow = {
  id: string;
  tracked_product_id: string;
  old_price: number;
  new_price: number;
  detected_at: string | null;
}
export type SpyPriceHistoryInsert = {
  id?: string;
  tracked_product_id: string;
  old_price: number;
  new_price: number;
  detected_at?: string | null;
}

export type TradingAccountRow = {
  id: string;
  user_id: string;
  name: string;
  balance: number;
  currency: string;
  max_risk_percent: number;
  created_at: string | null;
}
export type TradingAccountInsert = {
  id?: string;
  user_id: string;
  name: string;
  balance?: number;
  currency?: string;
  max_risk_percent?: number;
  created_at?: string | null;
}

export type TradingJournalRow = {
  id: string;
  user_id: string;
  account_id: string;
  symbol: string;
  direction: TradeDirection;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  position_size: number;
  exit_price: number | null;
  net_pnl: number | null;
  r_multiple: number | null;
  status: TradeStatus;
  notes: string | null;
  executed_at: string | null;
  closed_at: string | null;
}
export type TradingJournalInsert = {
  id?: string;
  user_id: string;
  account_id: string;
  symbol: string;
  direction: TradeDirection;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  position_size: number;
  exit_price?: number | null;
  net_pnl?: number | null;
  r_multiple?: number | null;
  status?: TradeStatus;
  notes?: string | null;
  executed_at?: string | null;
  closed_at?: string | null;
}

export type Database = {
  public: {
    Tables: {
      dropship_products: TableDef<DropshipProductRow, DropshipProductInsert, Partial<DropshipProductInsert>>;
      dropship_orders: TableDef<DropshipOrderRow, DropshipOrderInsert, Partial<DropshipOrderInsert>>;
      dropship_ad_spend: TableDef<DropshipAdSpendRow, DropshipAdSpendInsert, Partial<DropshipAdSpendInsert>>;
      dropship_stores: TableDef<DropshipStoreRow, DropshipStoreInsert, Partial<DropshipStoreInsert>>;
      spy_targets: TableDef<SpyTargetRow, SpyTargetInsert, Partial<SpyTargetInsert>>;
      spy_tracked_products: TableDef<SpyTrackedProductRow, SpyTrackedProductInsert, Partial<SpyTrackedProductInsert>>;
      spy_price_history: TableDef<SpyPriceHistoryRow, SpyPriceHistoryInsert, Partial<SpyPriceHistoryInsert>>;
      trading_accounts: TableDef<TradingAccountRow, TradingAccountInsert, Partial<TradingAccountInsert>>;
      trading_journal: TableDef<TradingJournalRow, TradingJournalInsert, Partial<TradingJournalInsert>>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
