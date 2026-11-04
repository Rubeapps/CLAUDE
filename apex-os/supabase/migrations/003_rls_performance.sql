-- ════════════════════════════════════════════════════════════════════════════
-- APEX OS — Migração 003: desempenho de RLS e índices de chaves estrangeiras
-- (avisos do Supabase Advisor: auth_rls_initplan e unindexed_foreign_keys)
-- `(select auth.uid())` é avaliado uma vez por query em vez de uma vez por linha.
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_dropship_stores_user ON dropship_stores (user_id);
CREATE INDEX IF NOT EXISTS idx_trading_accounts_user ON trading_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_trading_journal_account ON trading_journal (account_id);

ALTER POLICY "Dropship products user isolation" ON dropship_products
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Dropship orders user isolation" ON dropship_orders
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Dropship ad spend user isolation" ON dropship_ad_spend
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Dropship stores user isolation" ON dropship_stores
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Spy targets user isolation" ON spy_targets
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Spy products user isolation" ON spy_tracked_products USING (
    EXISTS (SELECT 1 FROM spy_targets WHERE spy_targets.id = spy_tracked_products.target_id AND spy_targets.user_id = (select auth.uid()))
);
ALTER POLICY "Spy history user isolation" ON spy_price_history USING (
    EXISTS (
        SELECT 1 FROM spy_tracked_products
        JOIN spy_targets ON spy_targets.id = spy_tracked_products.target_id
        WHERE spy_tracked_products.id = spy_price_history.tracked_product_id AND spy_targets.user_id = (select auth.uid())
    )
);
ALTER POLICY "Trading accounts user isolation" ON trading_accounts
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Trading journal user isolation" ON trading_journal
    USING ((select auth.uid()) = user_id)
    WITH CHECK (
        (select auth.uid()) = user_id
        AND EXISTS (SELECT 1 FROM trading_accounts WHERE trading_accounts.id = trading_journal.account_id AND trading_accounts.user_id = (select auth.uid()))
    );
ALTER POLICY "War chest isolation" ON war_chest_settings
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Ad creatives isolation" ON dropship_ad_creatives
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
