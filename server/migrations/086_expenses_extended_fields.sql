-- Migration 086: Extend expenses table for the expenses.html data model
-- Adds supplier/VAT/invoice/driver/employee/approval/attachments and ZAR default.

ALTER TABLE expenses ALTER COLUMN currency SET DEFAULT 'ZAR';
ALTER TABLE expenses ALTER COLUMN description DROP NOT NULL;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier      TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_pct       NUMERIC(6,2) DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_ref   TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS driver_id     TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS driver_name   TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS employee_id   TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS employee_name TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval      TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS attachments   JSONB DEFAULT '[]'::jsonb;

UPDATE expenses SET currency = 'ZAR' WHERE currency IS NULL OR currency IN ('GBP', 'USD');

CREATE INDEX IF NOT EXISTS idx_expenses_driver   ON expenses(driver_id);
CREATE INDEX IF NOT EXISTS idx_expenses_employee ON expenses(employee_id);
