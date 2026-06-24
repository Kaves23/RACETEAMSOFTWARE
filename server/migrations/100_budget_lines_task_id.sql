-- Migration 100: Add task_id to fin_budget_lines; expand category options
-- Allows Gantt task inspector to attach itemised budget line items to tasks,
-- which then automatically roll up to project and event cost reports.

ALTER TABLE fin_budget_lines
  ADD COLUMN IF NOT EXISTS task_id VARCHAR(36) REFERENCES project_tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_fin_budget_lines_task ON fin_budget_lines(task_id);

-- Expand the category CHECK constraint to cover task-level cost types
ALTER TABLE fin_budget_lines DROP CONSTRAINT IF EXISTS fin_budget_lines_category_check;
ALTER TABLE fin_budget_lines ADD CONSTRAINT fin_budget_lines_category_check
  CHECK (category IN (
    'track_hire','medical_hire','officials_hire','advertising','freight',
    'accommodation','catering','entry_fee',
    'material','equipment','consumables','labour_external','service','other'
  ));
