-- Migration 095: Finance budget lines (detailed budgeting per category/scope)
-- A budget line is a tracked spend category (track hire, medical hire, officials
-- hire, advertising, freight, etc.) optionally scoped to an event or a project.
-- Budgeted vs committed vs actual are tracked so spend can be reconciled.
-- Additive + nullable; safe on existing data.

CREATE TABLE IF NOT EXISTS fin_budget_lines (
  id               VARCHAR(36) PRIMARY KEY,
  name             TEXT NOT NULL,
  category         TEXT,                       -- track_hire, medical_hire, officials_hire, advertising, freight, accommodation, catering, entry_fee, other
  description      TEXT,
  scope_type       TEXT NOT NULL DEFAULT 'standalone',  -- event | project | standalone
  event_id         VARCHAR(36),
  project_id       VARCHAR(36),
  budgeted_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  committed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  actual_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'ZAR',
  due_date         DATE,
  status           TEXT NOT NULL DEFAULT 'open', -- open | committed | partial | settled | cancelled
  vendor           TEXT,
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_lines_scope    ON fin_budget_lines(scope_type);
CREATE INDEX IF NOT EXISTS idx_budget_lines_event    ON fin_budget_lines(event_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_project  ON fin_budget_lines(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_category ON fin_budget_lines(category);
CREATE INDEX IF NOT EXISTS idx_budget_lines_due      ON fin_budget_lines(due_date);
CREATE INDEX IF NOT EXISTS idx_budget_lines_status   ON fin_budget_lines(status);

-- Link actual spend back to a budget line
ALTER TABLE fin_payments ADD COLUMN IF NOT EXISTS budget_line_id VARCHAR(36);
ALTER TABLE expenses     ADD COLUMN IF NOT EXISTS budget_line_id VARCHAR(36);

CREATE INDEX IF NOT EXISTS idx_fin_payments_budget_line ON fin_payments(budget_line_id);
CREATE INDEX IF NOT EXISTS idx_expenses_budget_line     ON expenses(budget_line_id);
