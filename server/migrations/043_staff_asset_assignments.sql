-- Migration 043: Staff asset assignment
-- Allows items, boxes, and inventory to be checked out to a staff / mechanic.
-- Pattern mirrors assigned_driver_id on boxes:
--   - Denormalised current holder column on the asset table (fast lookup)
--   - History table for full checkout trail (who had what, when, returned)

-- ===================================================================
-- 1. Add assigned_staff_id to items, boxes, inventory
-- ===================================================================
DO $$ BEGIN
  ALTER TABLE items ADD COLUMN assigned_staff_id VARCHAR(36) REFERENCES staff(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE boxes ADD COLUMN assigned_staff_id VARCHAR(36) REFERENCES staff(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE inventory ADD COLUMN assigned_staff_id VARCHAR(36) REFERENCES staff(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ===================================================================
-- 2. Indexes on the new FK columns (partial — only rows with a holder)
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_items_assigned_staff
  ON items(assigned_staff_id)
  WHERE assigned_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_boxes_assigned_staff
  ON boxes(assigned_staff_id)
  WHERE assigned_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_assigned_staff
  ON inventory(assigned_staff_id)
  WHERE assigned_staff_id IS NOT NULL;

-- ===================================================================
-- 3. Assignment history log
--    One row per assignment. returned_at NULL = currently checked out.
-- ===================================================================
CREATE TABLE IF NOT EXISTS staff_item_assignments (
  id            VARCHAR(36)  PRIMARY KEY,
  staff_id      VARCHAR(36)  NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  asset_id      VARCHAR(36)  NOT NULL,
  asset_type    VARCHAR(20)  NOT NULL CHECK (asset_type IN ('item', 'box', 'inventory')),
  assigned_at   TIMESTAMPTZ  DEFAULT NOW(),
  returned_at   TIMESTAMPTZ,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_sia_staff
  ON staff_item_assignments(staff_id);

CREATE INDEX IF NOT EXISTS idx_sia_asset
  ON staff_item_assignments(asset_id, asset_type);

-- Fast lookup: all active checkouts for a staff member
CREATE INDEX IF NOT EXISTS idx_sia_staff_active
  ON staff_item_assignments(staff_id, asset_id)
  WHERE returned_at IS NULL;
