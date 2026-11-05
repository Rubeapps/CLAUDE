-- ════════════════════════════════════════════════════════════════════════════
-- APEX OS — Migração 005: Meta Ad Intelligence & Creative Tracker
-- Um registo por criativo (anúncios com texto idêntico são agrupados e contados
-- em active_copies_count). page_name e ad_platforms vêm da Ad Library API.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS spy_ad_creatives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    target_id UUID REFERENCES spy_targets(id) ON DELETE CASCADE,
    page_id TEXT NOT NULL,
    page_name TEXT,
    ad_archive_id TEXT NOT NULL,
    ad_caption TEXT,
    headline TEXT,
    cta_type TEXT,
    landing_page_url TEXT,
    video_url TEXT,
    thumbnail_url TEXT,
    ad_platforms TEXT[],
    first_active_date DATE NOT NULL,
    days_active INT NOT NULL DEFAULT 1,
    active_copies_count INT NOT NULL DEFAULT 1,
    winner_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    is_scaling BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, ad_archive_id)
);

ALTER TABLE spy_ad_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ad creatives user isolation" ON spy_ad_creatives FOR ALL
    USING ((select auth.uid()) = user_id)
    WITH CHECK (
        (select auth.uid()) = user_id
        AND (target_id IS NULL OR EXISTS (SELECT 1 FROM spy_targets WHERE spy_targets.id = spy_ad_creatives.target_id AND spy_targets.user_id = (select auth.uid())))
    );

CREATE INDEX IF NOT EXISTS idx_spy_ads_winner_score ON spy_ad_creatives (winner_score DESC);
CREATE INDEX IF NOT EXISTS idx_spy_ads_page_id ON spy_ad_creatives (page_id);
CREATE INDEX IF NOT EXISTS idx_spy_ads_user_page ON spy_ad_creatives (user_id, page_id);
CREATE INDEX IF NOT EXISTS idx_spy_ads_target ON spy_ad_creatives (target_id);
