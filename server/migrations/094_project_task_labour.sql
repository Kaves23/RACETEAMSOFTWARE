-- Migration 094: Project task labour costing (Finance Phase — task labour)
-- Adds a billable hourly rate to staff and a labour-entry table so Gantt
-- tasks can record staff hours with both an internal cost rate and a
-- billable charge-out rate. All additive + nullable; safe on existing data.

-- ── Staff billable rate (cost rate already exists as hourly_rate) ────────────
ALTER TABLE staff ADD COLUMN IF NOT EXISTS bill_rate_hourly NUMERIC(12,2);

-- ── Task labour entries ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_task_labour (
  id          VARCHAR(36) PRIMARY KEY,
  task_id     VARCHAR(36) NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  staff_id    VARCHAR(36) REFERENCES staff(id) ON DELETE SET NULL,
  staff_name  TEXT,
  work_date   DATE,
  hours       NUMERIC(8,2)  NOT NULL DEFAULT 0,
  cost_rate   NUMERIC(12,2) NOT NULL DEFAULT 0,   -- internal cost per hour
  bill_rate   NUMERIC(12,2) NOT NULL DEFAULT 0,   -- charge-out per hour
  billable    BOOLEAN       NOT NULL DEFAULT TRUE,
  currency    TEXT          NOT NULL DEFAULT 'ZAR',
  notes       TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  cost_amount NUMERIC(14,2) GENERATED ALWAYS AS (ROUND(hours * cost_rate, 2)) STORED,
  bill_amount NUMERIC(14,2) GENERATED ALWAYS AS (ROUND(CASE WHEN billable THEN hours * bill_rate ELSE 0 END, 2)) STORED
);

CREATE INDEX IF NOT EXISTS idx_task_labour_task  ON project_task_labour(task_id);
CREATE INDEX IF NOT EXISTS idx_task_labour_staff ON project_task_labour(staff_id);
