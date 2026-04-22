-- Migration 066: Add load_plan_assets table for standalone asset & inventory placements
-- Previously only box placements were persisted; this adds support for assets and inventory
-- dropped directly into a truck zone.

CREATE TABLE IF NOT EXISTS load_plan_assets (
  id            SERIAL PRIMARY KEY,
  load_plan_id  TEXT        NOT NULL REFERENCES load_plans(id) ON DELETE CASCADE,
  item_type     TEXT        NOT NULL CHECK (item_type IN ('asset', 'inventory')),
  item_id       TEXT        NOT NULL,
  truck_zone    TEXT,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lpa_plan   ON load_plan_assets (load_plan_id);
CREATE INDEX IF NOT EXISTS idx_lpa_item   ON load_plan_assets (item_type, item_id);
