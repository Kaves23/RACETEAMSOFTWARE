-- Migration 059: Finance Module
-- Tables: fin_budgets, fin_payments (expenses & invoices use existing pages)

CREATE TABLE IF NOT EXISTS fin_budgets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  category        TEXT,
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  spent_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  period          TEXT,                       -- e.g. '2026-S1', '2026-Q2', '2026'
  event_id        UUID,
  status          TEXT        NOT NULL DEFAULT 'active',  -- active, closed, suspended
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fin_payments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payee           TEXT        NOT NULL,
  description     TEXT,
  amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency        TEXT        NOT NULL DEFAULT 'GBP',
  payment_date    DATE,
  reference       TEXT,
  method          TEXT        DEFAULT 'bank_transfer',  -- bank_transfer, card, cash, cheque
  status          TEXT        NOT NULL DEFAULT 'pending', -- pending, approved, paid, cancelled
  budget_id       UUID        REFERENCES fin_budgets(id) ON DELETE SET NULL,
  category        TEXT,
  event_id        UUID,
  notes           TEXT,
  approved_by     TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_budgets_status   ON fin_budgets  (status);
CREATE INDEX IF NOT EXISTS idx_fin_budgets_period   ON fin_budgets  (period);
CREATE INDEX IF NOT EXISTS idx_fin_payments_status  ON fin_payments (status);
CREATE INDEX IF NOT EXISTS idx_fin_payments_budget  ON fin_payments (budget_id);
CREATE INDEX IF NOT EXISTS idx_fin_payments_date    ON fin_payments (payment_date);
