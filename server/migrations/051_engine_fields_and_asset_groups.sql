-- Migration 051: Engine-specific custom fields + asset grouping (parent/child)
-- Added: 14 April 2026
-- Adds:
--   items.custom_fields   JSONB  — stores engine seal/carb/exhaust/airbox numbers, exhaust number etc.
--   items.parent_asset_id VARCHAR — links a child asset (carb, airbox, exhaust) to its parent (engine)

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS custom_fields  JSONB          DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS parent_asset_id VARCHAR(36)   NULL REFERENCES items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_parent_asset ON items(parent_asset_id);
