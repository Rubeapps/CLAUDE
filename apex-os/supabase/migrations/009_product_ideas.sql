-- ════════════════════════════════════════════════════════════════════════════
-- APEX OS — Migração 009: calculadora de produtos (produtos que ainda não estão na loja)
-- inputs JSONB: preço, COGS, CPA, IVA, margem alvo, gateway e portes por país (1/2/3 un.).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dropship_product_ideas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_ideas_user ON dropship_product_ideas (user_id, updated_at DESC);

ALTER TABLE dropship_product_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Product ideas isolation" ON dropship_product_ideas FOR ALL
    USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
