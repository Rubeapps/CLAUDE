/**
 * Tipos da base de dados (espelho de supabase/schema.sql).
 * Formato compatível com `supabase gen types typescript`.
 * NUMERIC e BIGINT chegam do PostgREST como `number` em JSON.
 */

export type AdPlatform = "META" | "TIKTOK" | "GOOGLE";
export type TradeDirection = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED" | "CANCELLED";
export type MentalState = "CALM" | "FOCUSED" | "TIRED" | "ANXIOUS" | "EUPHORIC" | "REVENGE";

type TableDef<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type DropshipProductRow = {
  id: string;
  user_id: string;
  sku: string;
  name: string;
  cogs: number;
  shipping_cost: number;
  shipping_cost_2: number | null;
  shipping_cost_3: number | null;
  created_at: string | null;
};
export type DropshipProductInsert = {
  id?: string;
  user_id: string;
  sku: string;
  name: string;
  cogs?: number;
  shipping_cost?: number;
  shipping_cost_2?: number | null;
  shipping_cost_3?: number | null;
  created_at?: string | null;
};

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
};
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
};

export type DropshipAdSpendRow = {
  id: string;
  user_id: string;
  date: string;
  platform: AdPlatform;
  amount: number;
  created_at: string | null;
};
export type DropshipAdSpendInsert = {
  id?: string;
  user_id: string;
  date: string;
  platform: AdPlatform;
  amount?: number;
  created_at?: string | null;
};

export type DropshipStoreRow = {
  id: string;
  user_id: string;
  shop_domain: string;
  created_at: string | null;
};
export type DropshipStoreInsert = {
  id?: string;
  user_id: string;
  shop_domain: string;
  created_at?: string | null;
};

export type SpyTargetRow = {
  id: string;
  user_id: string;
  store_name: string;
  store_url: string;
  is_active: boolean;
  last_scraped_at: string | null;
  meta_page_id: string | null;
  created_at: string | null;
};
export type SpyTargetInsert = {
  id?: string;
  user_id: string;
  store_name: string;
  store_url: string;
  is_active?: boolean;
  last_scraped_at?: string | null;
  meta_page_id?: string | null;
  created_at?: string | null;
};

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
  is_scaling: boolean | null;
  available_variants: number | null;
  scaling_detected_at: string | null;
};
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
  is_scaling?: boolean | null;
  available_variants?: number | null;
  scaling_detected_at?: string | null;
};

export type SpyPriceHistoryRow = {
  id: string;
  tracked_product_id: string;
  old_price: number;
  new_price: number;
  detected_at: string | null;
};
export type SpyPriceHistoryInsert = {
  id?: string;
  tracked_product_id: string;
  old_price: number;
  new_price: number;
  detected_at?: string | null;
};

export type TradingAccountRow = {
  id: string;
  user_id: string;
  name: string;
  balance: number;
  currency: string;
  max_risk_percent: number;
  max_daily_loss_percent: number | null;
  created_at: string | null;
};
export type TradingAccountInsert = {
  id?: string;
  user_id: string;
  name: string;
  balance?: number;
  currency?: string;
  max_risk_percent?: number;
  max_daily_loss_percent?: number | null;
  created_at?: string | null;
};

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
  fomo_check_passed: boolean;
  mental_state: string | null;
};
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
  fomo_check_passed?: boolean;
  mental_state?: string | null;
};

export type WarChestSettingsRow = {
  id: string;
  user_id: string;
  reinvest_percent: number;
  emergency_tax_percent: number;
  trading_injection_percent: number;
  current_cash_reserve: number;
  updated_at: string | null;
};
export type WarChestSettingsInsert = {
  id?: string;
  user_id: string;
  reinvest_percent?: number;
  emergency_tax_percent?: number;
  trading_injection_percent?: number;
  current_cash_reserve?: number;
  updated_at?: string | null;
};

export type DropshipAdCreativeRow = {
  id: string;
  user_id: string;
  campaign_name: string;
  ad_name: string;
  spend: number;
  impressions: number;
  video_plays_3s: number | null;
  thruplays: number | null;
  frequency: number | null;
  ctr: number | null;
  cpa: number | null;
  date: string;
  is_fatigued: boolean | null;
  created_at: string | null;
};
export type DropshipAdCreativeInsert = {
  id?: string;
  user_id: string;
  campaign_name: string;
  ad_name: string;
  spend: number;
  impressions: number;
  video_plays_3s?: number | null;
  thruplays?: number | null;
  frequency?: number | null;
  ctr?: number | null;
  cpa?: number | null;
  date: string;
  is_fatigued?: boolean | null;
  created_at?: string | null;
};

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
      war_chest_settings: TableDef<WarChestSettingsRow, WarChestSettingsInsert, Partial<WarChestSettingsInsert>>;
      dropship_ad_creatives: TableDef<DropshipAdCreativeRow, DropshipAdCreativeInsert, Partial<DropshipAdCreativeInsert>>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
