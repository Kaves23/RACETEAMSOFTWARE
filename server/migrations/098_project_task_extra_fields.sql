-- Migration 098: Project task extra fields for richer inspector UX
-- Adds risk level, tags, acceptance criteria and external reference
-- to project_tasks. All additive + nullable; safe on existing data.

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS risk_level          TEXT
  CHECK (risk_level IN ('low','medium','high','critical'));

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS tags                TEXT;

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT;

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS external_ref        TEXT;

CREATE INDEX IF NOT EXISTS idx_project_tasks_risk ON project_tasks(risk_level);
