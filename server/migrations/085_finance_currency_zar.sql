-- Migration 085: Standardise finance on ZAR
-- Switches default currency to ZAR and backfills existing rows.

-- fin_payments: default currency ZAR, backfill any GBP/USD/null rows
ALTER TABLE fin_payments ALTER COLUMN currency SET DEFAULT 'ZAR';
UPDATE fin_payments SET currency = 'ZAR' WHERE currency IS NULL OR currency IN ('GBP', 'USD');

-- fin_budgets: add an explicit currency column for clarity (was implicit)
ALTER TABLE fin_budgets ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ZAR';
UPDATE fin_budgets SET currency = 'ZAR' WHERE currency IS NULL OR currency IN ('GBP', 'USD');
