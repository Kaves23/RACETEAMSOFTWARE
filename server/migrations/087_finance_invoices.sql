-- Migration 087: Invoices & invoice customers (ZAR)
-- Lines are stored as JSONB to mirror the invoice.html record model.

CREATE TABLE IF NOT EXISTS fin_invoice_customers (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  email        TEXT,
  phone        TEXT,
  address      TEXT,
  sage_ref     TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fin_invoices (
  id               TEXT        PRIMARY KEY,
  number           TEXT,
  status           TEXT        NOT NULL DEFAULT 'Draft',  -- Draft, Sent, Paid, Overdue
  inv_type         TEXT,
  invoice_date     DATE,
  due_date         DATE,
  customer_id      TEXT,
  customer_details TEXT,
  event_id         TEXT,
  driver_id        TEXT,
  vat_rate         NUMERIC(6,2) DEFAULT 15,
  currency         TEXT        NOT NULL DEFAULT 'ZAR',
  lines            JSONB       DEFAULT '[]'::jsonb,
  notes            TEXT,
  sage_nominal     TEXT,
  tax_code         TEXT,
  department       TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_invoices_status   ON fin_invoices (status);
CREATE INDEX IF NOT EXISTS idx_fin_invoices_customer ON fin_invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_fin_invoices_event    ON fin_invoices (event_id);
