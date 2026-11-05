-- ════════════════════════════════════════════════════════════════════════════
-- APEX OPERATIONS OS — Supabase PostgreSQL schema
-- Executar no Supabase Dashboard → SQL Editor (uma vez, num projeto novo).
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. DROPSHIPPING MODULE ─────────────────────────────────────────────────

CREATE TABLE dropship_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    cogs NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, sku)
);

CREATE TABLE dropship_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    shopify_order_id TEXT NOT NULL,
    order_number TEXT NOT NULL,
    total_price NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    gateway TEXT NOT NULL,
    gateway_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_cogs NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_shipping NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    net_profit NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status_financial TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, shopify_order_id)
);

CREATE TABLE dropship_ad_spend (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('META', 'TIKTOK', 'GOOGLE')),
    amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date, platform)
);

-- Liga o domínio myshopify da loja ao utilizador, para que o webhook
-- (que chega sem sessão) saiba a que user_id pertence cada encomenda.
CREATE TABLE dropship_stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    shop_domain TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. SPY ENGINE MODULE ───────────────────────────────────────────────────

CREATE TABLE spy_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    store_name TEXT NOT NULL,
    store_url TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_scraped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, store_url)
);

CREATE TABLE spy_tracked_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_id UUID REFERENCES spy_targets(id) ON DELETE CASCADE NOT NULL,
    shopify_product_id BIGINT NOT NULL,
    title TEXT NOT NULL,
    handle TEXT NOT NULL,
    current_price NUMERIC(10,2) NOT NULL,
    compare_at_price NUMERIC(10,2),
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    image_url TEXT,
    published_at TIMESTAMPTZ,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(target_id, shopify_product_id)
);

CREATE TABLE spy_price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracked_product_id UUID REFERENCES spy_tracked_products(id) ON DELETE CASCADE NOT NULL,
    old_price NUMERIC(10,2) NOT NULL,
    new_price NUMERIC(10,2) NOT NULL,
    detected_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. TRADING MODULE ──────────────────────────────────────────────────────

CREATE TABLE trading_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'USD',
    max_risk_percent NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trading_journal (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES trading_accounts(id) ON DELETE CASCADE NOT NULL,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
    entry_price NUMERIC(12,4) NOT NULL,
    stop_loss NUMERIC(12,4) NOT NULL,
    take_profit NUMERIC(12,4) NOT NULL,
    position_size NUMERIC(12,4) NOT NULL,
    exit_price NUMERIC(12,4),
    net_pnl NUMERIC(12,2),
    r_multiple NUMERIC(6,2),
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')) DEFAULT 'OPEN',
    notes TEXT,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

-- ─── ÍNDICES (consultas por utilizador + período) ───────────────────────────

CREATE INDEX idx_dropship_orders_user_created ON dropship_orders (user_id, created_at DESC);
CREATE INDEX idx_dropship_ad_spend_user_date ON dropship_ad_spend (user_id, date DESC);
CREATE INDEX idx_spy_targets_active ON spy_targets (is_active) WHERE is_active;
CREATE INDEX idx_spy_tracked_products_target ON spy_tracked_products (target_id, last_updated_at DESC);
CREATE INDEX idx_spy_price_history_product ON spy_price_history (tracked_product_id, detected_at DESC);
CREATE INDEX idx_trading_journal_user_account ON trading_journal (user_id, account_id, executed_at DESC);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE dropship_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE dropship_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE dropship_ad_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE dropship_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE spy_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE spy_tracked_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE spy_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dropship products user isolation" ON dropship_products FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Dropship orders user isolation" ON dropship_orders FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Dropship ad spend user isolation" ON dropship_ad_spend FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Dropship stores user isolation" ON dropship_stores FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Spy targets user isolation" ON spy_targets FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Spy products user isolation" ON spy_tracked_products FOR ALL USING (
    EXISTS (SELECT 1 FROM spy_targets WHERE spy_targets.id = spy_tracked_products.target_id AND spy_targets.user_id = auth.uid())
);
CREATE POLICY "Spy history user isolation" ON spy_price_history FOR ALL USING (
    EXISTS (
        SELECT 1 FROM spy_tracked_products
        JOIN spy_targets ON spy_targets.id = spy_tracked_products.target_id
        WHERE spy_tracked_products.id = spy_price_history.tracked_product_id AND spy_targets.user_id = auth.uid()
    )
);

CREATE POLICY "Trading accounts user isolation" ON trading_accounts FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- O diário só aceita trades em contas do próprio utilizador.
CREATE POLICY "Trading journal user isolation" ON trading_journal FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (SELECT 1 FROM trading_accounts WHERE trading_accounts.id = trading_journal.account_id AND trading_accounts.user_id = auth.uid())
    );
