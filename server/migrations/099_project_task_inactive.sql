-- Migration 099: Add is_inactive flag to project tasks
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS is_inactive BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_project_tasks_inactive ON project_tasks(is_inactive) WHERE is_inactive = TRUE;
