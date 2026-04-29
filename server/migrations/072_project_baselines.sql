-- Migration 072: Project Baselines
-- Creates tables for baseline snapshots used in Gantt baseline comparison (Phase 5)

CREATE TABLE IF NOT EXISTS project_baselines (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id     TEXT        NOT NULL REFERENCES project_plans(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  created_by  VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_baseline_tasks (
  id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  baseline_id      UUID    NOT NULL REFERENCES project_baselines(id) ON DELETE CASCADE,
  task_id          TEXT    NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  planned_start    DATE,
  planned_end      DATE,
  planned_progress INTEGER DEFAULT 0,
  is_milestone     BOOLEAN DEFAULT FALSE,
  UNIQUE (baseline_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_project_baselines_plan     ON project_baselines(plan_id);
CREATE INDEX IF NOT EXISTS idx_project_baseline_tasks_bl  ON project_baseline_tasks(baseline_id);
CREATE INDEX IF NOT EXISTS idx_project_baseline_tasks_tid ON project_baseline_tasks(task_id);
