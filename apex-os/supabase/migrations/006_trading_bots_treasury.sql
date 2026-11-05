-- ════════════════════════════════════════════════════════════════════════════
-- APEX OS — Migração 006: Trading Bot Engine + Cofre Fiscal (Tax Reserve Vault)
-- Alterações face à especificação original (segurança):
--   · is_testnet (TRUE por omissão) — um bot só toca em fundos reais se o utilizador o decidir.
--   · webhook_secret gerado com extensions.gen_random_bytes (pgcrypto do Supabase).
--   · api_key/api_secret guardados encriptados (AES-256-GCM, chave BOT_ENCRYPTION_KEY só no servidor).
--   · compliance_checklist no cofre para o checklist fiscal do Knowledge Hub.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS trading_bots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES trading_accounts(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    strategy_type TEXT NOT NULL CHECK (strategy_type IN ('WEBHOOK_SIGNAL', 'RSI_DCA', 'BREAKOUT')),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    is_testnet BOOLEAN NOT NULL DEFAULT TRUE,
    risk_per_trade_percent NUMERIC(4,2) NOT NULL DEFAULT 1.00,
    webhook_secret TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (webhook_secret)
);

CREATE TABLE IF NOT EXISTS trading_bot_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_id UUID REFERENCES trading_bots(id) ON DELETE CASCADE NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS treasury_tax_vault (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    estimated_vat_percent NUMERIC(5,2) NOT NULL DEFAULT 23.00,
    estimated_income_tax_percent NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    rolling_reserve_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    total_tax_reserved NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    compliance_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_reconciliation_date TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trading_bots_user ON trading_bots (user_id);
CREATE INDEX IF NOT EXISTS idx_trading_bots_account ON trading_bots (account_id);
CREATE INDEX IF NOT EXISTS idx_trading_bot_logs_bot ON trading_bot_logs (bot_id, created_at DESC);

ALTER TABLE trading_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_bot_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_tax_vault ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bots user isolation" ON trading_bots FOR ALL
    USING ((select auth.uid()) = user_id)
    WITH CHECK (
        (select auth.uid()) = user_id
        AND EXISTS (SELECT 1 FROM trading_accounts WHERE trading_accounts.id = trading_bots.account_id AND trading_accounts.user_id = (select auth.uid()))
    );
CREATE POLICY "Bot logs user isolation" ON trading_bot_logs FOR ALL USING (
    EXISTS (SELECT 1 FROM trading_bots WHERE trading_bots.id = trading_bot_logs.bot_id AND trading_bots.user_id = (select auth.uid()))
);
CREATE POLICY "Treasury vault user isolation" ON treasury_tax_vault FOR ALL
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
