-- Migration 088: Driver packages (per-driver package inclusion + pricing, ZAR)
-- Replaces the localStorage rts.driver.packages.v1 store and adds unit pricing.

CREATE TABLE IF NOT EXISTS driver_packages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     TEXT        NOT NULL,
  package_key   TEXT        NOT NULL,
  package_name  TEXT,
  mode          TEXT        NOT NULL DEFAULT 'invoice',  -- included | invoice
  unit_price    NUMERIC(14,2) NOT NULL DEFAULT 0,
  qty           NUMERIC(10,2) NOT NULL DEFAULT 1,
  currency      TEXT        NOT NULL DEFAULT 'ZAR',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (driver_id, package_key)
);

CREATE INDEX IF NOT EXISTS idx_driver_packages_driver ON driver_packages (driver_id);
