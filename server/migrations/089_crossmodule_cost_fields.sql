-- Migration 089: Cross-module cost fields (Finance Phase 2)
-- Adds budget/cost columns to projects, events, staff, and components so the
-- finance roll-up can aggregate spend across the whole system.
-- All columns are additive + nullable so existing rows and code keep working.

-- ── Projects ────────────────────────────────────────────────────────────────
ALTER TABLE project_plans  ADD COLUMN IF NOT EXISTS budget   NUMERIC(14,2);
ALTER TABLE project_plans  ADD COLUMN IF NOT EXISTS spent    NUMERIC(14,2) DEFAULT 0;
ALTER TABLE project_plans  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ZAR';

ALTER TABLE project_tasks  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(14,2);
ALTER TABLE project_tasks  ADD COLUMN IF NOT EXISTS actual_cost    NUMERIC(14,2);

-- ── Events ──────────────────────────────────────────────────────────────────
ALTER TABLE events ADD COLUMN IF NOT EXISTS entry_fee             NUMERIC(14,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS travel_budget         NUMERIC(14,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS accommodation_budget  NUMERIC(14,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS catering_budget       NUMERIC(14,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS other_budget          NUMERIC(14,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS budget_currency       TEXT DEFAULT 'ZAR';

-- ── Staff (employment cost) ──────────────────────────────────────────────────
ALTER TABLE staff ADD COLUMN IF NOT EXISTS salary_annual        NUMERIC(14,2);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS hourly_rate          NUMERIC(12,2);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS benefits_cost_annual NUMERIC(14,2);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS cost_currency        TEXT DEFAULT 'ZAR';

-- ── Components (unit cost + supplier link) ───────────────────────────────────
ALTER TABLE components ADD COLUMN IF NOT EXISTS unit_cost     NUMERIC(14,2);
ALTER TABLE components ADD COLUMN IF NOT EXISTS supplier_id   TEXT;
ALTER TABLE components ADD COLUMN IF NOT EXISTS cost_currency TEXT DEFAULT 'ZAR';

CREATE INDEX IF NOT EXISTS idx_events_entry_fee     ON events (entry_fee);
CREATE INDEX IF NOT EXISTS idx_components_supplier  ON components (supplier_id);
