-- ════════════════════════════════════════════════════════════════════════════
-- APEX OS — Migração 008: portes por país de entrega
-- dropship_shipping_countries: países que o utilizador quer gerir.
-- dropship_shipping_rates: portes totais por produto (nome do grupo), país e escalão 1/2/3 un.
--   Sem linha para o país ⇒ usam-se os portes por defeito de dropship_products.
-- dropship_orders.shipping_country: país de entrega (ISO-3166 alfa-2) vindo do Shopify.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dropship_shipping_countries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    country_code TEXT NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, country_code)
);

CREATE TABLE IF NOT EXISTS dropship_shipping_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    product_name TEXT NOT NULL,
    country_code TEXT NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
    shipping_1 NUMERIC(10,2) NOT NULL,
    shipping_2 NUMERIC(10,2),
    shipping_3 NUMERIC(10,2),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, product_name, country_code)
);

ALTER TABLE dropship_orders ADD COLUMN IF NOT EXISTS shipping_country TEXT;

CREATE INDEX IF NOT EXISTS idx_shipping_rates_lookup ON dropship_shipping_rates (user_id, country_code);

ALTER TABLE dropship_shipping_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE dropship_shipping_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shipping countries isolation" ON dropship_shipping_countries FOR ALL
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Shipping rates isolation" ON dropship_shipping_rates FOR ALL
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
