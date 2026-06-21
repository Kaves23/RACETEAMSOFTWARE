-- Migration 096: Bills / Accounts-Payable fields on expenses
-- Turns expenses into a proper Bills/AP module: a bill received has a due date,
-- can be linked to a project (in addition to the existing event_id), records
-- when it was paid, and can be tied to a budget line (budget_line_id added in 095).
-- Additive + nullable; safe on existing data.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS due_date   DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_date  DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS project_id VARCHAR(36);

CREATE INDEX IF NOT EXISTS idx_expenses_due_date  ON expenses(due_date);
CREATE INDEX IF NOT EXISTS idx_expenses_project   ON expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status    ON expenses(status);
