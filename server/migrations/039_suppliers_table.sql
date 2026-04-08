-- Migration 039: Create suppliers table
-- Moves suppliers from localStorage settings to the database

CREATE TABLE IF NOT EXISTS suppliers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  lead_time_days  INTEGER NOT NULL DEFAULT 0,
  vat_number      TEXT NOT NULL DEFAULT '',
  account_number  TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
