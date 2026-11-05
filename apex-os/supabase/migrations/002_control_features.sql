-- ════════════════════════════════════════════════════════════════════════════
-- APEX OS — Migração 002: War Chest, Ad Fatigue, Meta Ad Library, Anti-FOMO
-- Executar no SQL Editor DEPOIS de supabase/schema.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. WAR CHEST & CAPITAL ALLOCATION
CREATE TABLE IF NOT EXISTS war_chest_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    reinvest_percent NUMERIC(5,2) NOT NULL DEFAULT 50.00,
    emergency_tax_percent NUMERIC(5,2) NOT NULL DEFAULT 30.00,
    trading_injection_percent NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    current_cash_reserve NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT war_chest_percent_sum CHECK (reinvest_percent + emergency_tax_percent + trading_injection_percent = 100)
);

-- 2. MÉTRICAS DE FADIGA DE ADS & IMPORTAÇÃO CSV
CREATE TABLE IF NOT EXISTS dropship_ad_creatives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    campaign_name TEXT NOT NULL,
    ad_name TEXT NOT NULL,
    spend NUMERIC(10,2) NOT NULL,
    impressions INT NOT NULL,
    video_plays_3s INT DEFAULT 0,
    thruplays INT DEFAULT 0,
    frequency NUMERIC(5,2) DEFAULT 1.00,
    ctr NUMERIC(5,2) DEFAULT 0.00,
    cpa NUMERIC(10,2) DEFAULT 0.00,
    date DATE NOT NULL,
    is_fatigued BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Reimportar o mesmo CSV atualiza em vez de duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_creatives_user_date_ad ON dropship_ad_creatives (user_id, date, campaign_name, ad_name);

-- 3. EXPANSÃO DO SPY (META AD LIBRARY + SINAL DE ESCALA)
ALTER TABLE spy_targets ADD COLUMN IF NOT EXISTS meta_page_id TEXT;
ALTER TABLE spy_tracked_products ADD COLUMN IF NOT EXISTS is_scaling BOOLEAN DEFAULT FALSE;
-- Suporte ao sinal de escala: nº de variantes disponíveis (mudança = movimento de stock)
-- e quando o sinal foi visto pela última vez (is_scaling fica ativo 72h).
ALTER TABLE spy_tracked_products ADD COLUMN IF NOT EXISTS available_variants INT;
ALTER TABLE spy_tracked_products ADD COLUMN IF NOT EXISTS scaling_detected_at TIMESTAMPTZ;

-- 4. ANTI-FOMO & CIRCUIT BREAKER NO TRADING
ALTER TABLE trading_accounts ADD COLUMN IF NOT EXISTS max_daily_loss_percent NUMERIC(4,2) DEFAULT 3.00;
ALTER TABLE trading_journal ADD COLUMN IF NOT EXISTS fomo_check_passed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE trading_journal ADD COLUMN IF NOT EXISTS mental_state TEXT DEFAULT 'CALM';

-- POLÍTICAS RLS ADICIONAIS
ALTER TABLE war_chest_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dropship_ad_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "War chest isolation" ON war_chest_settings FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Ad creatives isolation" ON dropship_ad_creatives FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
