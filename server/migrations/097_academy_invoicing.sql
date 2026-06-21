-- Migration 097: Academy test-drive invoicing
-- Test drives are paid, so a prospect carries a test fee, a payment status and
-- an optional link to a generated invoice. Additive + nullable.

ALTER TABLE academy_prospects ADD COLUMN IF NOT EXISTS test_fee       NUMERIC(12,2);
ALTER TABLE academy_prospects ADD COLUMN IF NOT EXISTS fee_currency   TEXT DEFAULT 'ZAR';
ALTER TABLE academy_prospects ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'; -- unpaid | invoiced | paid
ALTER TABLE academy_prospects ADD COLUMN IF NOT EXISTS invoice_id     VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_academy_payment_status ON academy_prospects(payment_status);
