-- Migration 071: Projects Module Phase 2
-- Extends project_plans and project_tasks with richer fields required for
-- full MS-Project-grade project management.

-- ─────────────────────────────────────────────────────────────────────
-- 1. project_plans — new columns
-- ─────────────────────────────────────────────────────────────────────

-- Project type (what kind of project is this)
ALTER TABLE project_plans
  ADD COLUMN IF NOT EXISTS project_type TEXT
    CHECK (project_type IN (
      'event_preparation','logistics','sporting','technical',
      'marketing','staff_planning','driver_admin','venue',
      'compliance','post_event','internal'
    ));

-- Owner (primary responsible person — references users table)
ALTER TABLE project_plans
  ADD COLUMN IF NOT EXISTS owner_staff_id TEXT
    REFERENCES users(id) ON DELETE SET NULL;

-- Risk level
ALTER TABLE project_plans
  ADD COLUMN IF NOT EXISTS risk_level TEXT
    CHECK (risk_level IN ('low','medium','high','critical'));

-- Actual completion date (vs target end_date)
ALTER TABLE project_plans
  ADD COLUMN IF NOT EXISTS actual_end_date DATE;

-- Priority (project-level, mirrors task priority)
ALTER TABLE project_plans
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','critical'));

-- Extend status to include planned, on_hold, cancelled
-- SQLite doesn't support ALTER COLUMN — we update the check via a new approach.
-- For PostgreSQL, drop and re-add the constraint.
DO $$
BEGIN
  -- Drop old status constraint if it exists
  ALTER TABLE project_plans DROP CONSTRAINT IF EXISTS project_plans_status_check;
  -- Add updated constraint
  ALTER TABLE project_plans ADD CONSTRAINT project_plans_status_check
    CHECK (status IN ('planned','active','on_hold','completed','cancelled','archived'));
EXCEPTION WHEN OTHERS THEN
  NULL; -- Silently ignore if DB engine doesn't support (SQLite fallback)
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. project_plans — indexes
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_project_plans_owner
  ON project_plans (owner_staff_id);

CREATE INDEX IF NOT EXISTS idx_project_plans_type
  ON project_plans (project_type);

CREATE INDEX IF NOT EXISTS idx_project_plans_risk
  ON project_plans (risk_level);

-- ─────────────────────────────────────────────────────────────────────
-- 3. project_tasks — extended status enum (waiting_on, deferred)
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_status_check;
  ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_status_check
    CHECK (status IN (
      'not_started','in_progress','waiting_on','blocked',
      'completed','cancelled','deferred'
    ));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. project_tasks — new columns
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS department TEXT;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS task_type TEXT;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS actual_start_date DATE;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS actual_end_date DATE;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS duration_days INT;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS blocker_reason TEXT;

-- Expand linked_entity_type to include more system entities
DO $$
BEGIN
  ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_linked_entity_type_check;
  ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_linked_entity_type_check
    CHECK (linked_entity_type IN (
      'event','item','box','driver','truck',
      'load_plan','inventory','purchase_order','user',
      'staff','class','venue','supplier','location'
    ));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. project_task_assignments — secondary/additional assignees per task
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_task_assignments (
  id          TEXT        PRIMARY KEY,
  task_id     TEXT        NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  user_id     TEXT        REFERENCES users(id) ON DELETE SET NULL,
  role_on_task TEXT,
  is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proj_task_assign_task
  ON project_task_assignments (task_id);

CREATE INDEX IF NOT EXISTS idx_proj_task_assign_user
  ON project_task_assignments (user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 6. project_task_links — extend link_type to support all 4 dep types
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE project_task_links DROP CONSTRAINT IF EXISTS project_task_links_link_type_check;
  ALTER TABLE project_task_links ADD CONSTRAINT project_task_links_link_type_check
    CHECK (link_type IN (
      'finish_to_start','start_to_start','finish_to_finish','start_to_finish'
    ));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
