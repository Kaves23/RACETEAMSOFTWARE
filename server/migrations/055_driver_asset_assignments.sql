-- Migration 055: Driver asset assignments
-- Mirrors the staff_item_assignments pattern for drivers.

-- ===================================================================
-- 1. Add assigned_driver_id to items (drivers only assign items, not boxes)
-- ===================================================================
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN assigned_driver_id VARCHAR(36) REFERENCES drivers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_items_assigned_driver
  ON items(assigned_driver_id)
  WHERE assigned_driver_id IS NOT NULL;

-- ===================================================================
-- 2. Assignment history log (one row per assignment)
-- ===================================================================
CREATE TABLE IF NOT EXISTS driver_item_assignments (
  id            VARCHAR(36)  PRIMARY KEY,
  driver_id     VARCHAR(36)  NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  asset_id      VARCHAR(36)  NOT NULL,
  assigned_at   TIMESTAMPTZ  DEFAULT NOW(),
  returned_at   TIMESTAMPTZ,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_dia_driver
  ON driver_item_assignments(driver_id);

CREATE INDEX IF NOT EXISTS idx_dia_asset
  ON driver_item_assignments(asset_id);

CREATE INDEX IF NOT EXISTS idx_dia_driver_active
  ON driver_item_assignments(driver_id, asset_id)
  WHERE returned_at IS NULL;
