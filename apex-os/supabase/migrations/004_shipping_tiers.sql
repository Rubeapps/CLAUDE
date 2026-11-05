-- ════════════════════════════════════════════════════════════════════════════
-- APEX OS — Migração 004: portes por escalão de quantidade
-- shipping_cost   = portes totais para 1 unidade do produto
-- shipping_cost_2 = portes totais para 2 unidades (NULL ⇒ 2 × shipping_cost)
-- shipping_cost_3 = portes totais para 3 unidades (NULL ⇒ extrapolado)
-- Acima de 3 unidades cada unidade extra soma (shipping_cost_3 − shipping_cost_2).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE dropship_products ADD COLUMN IF NOT EXISTS shipping_cost_2 NUMERIC(10,2);
ALTER TABLE dropship_products ADD COLUMN IF NOT EXISTS shipping_cost_3 NUMERIC(10,2);
