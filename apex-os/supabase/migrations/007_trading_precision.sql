-- ════════════════════════════════════════════════════════════════════════════
-- APEX OS — Migração 007: precisão de preços e quantidades no diário de trading
-- NUMERIC(12,4) arredondava quantidades cripto (0.12387 BTC → 0.1239) e preços de
-- altcoins (0.00001234). Passa a NUMERIC(24,8), o máximo de casas decimais da Binance.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE trading_journal
    ALTER COLUMN entry_price TYPE NUMERIC(24,8),
    ALTER COLUMN stop_loss TYPE NUMERIC(24,8),
    ALTER COLUMN take_profit TYPE NUMERIC(24,8),
    ALTER COLUMN position_size TYPE NUMERIC(24,8),
    ALTER COLUMN exit_price TYPE NUMERIC(24,8);
