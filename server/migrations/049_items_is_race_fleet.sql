-- Migration 049: Add is_race_fleet flag to items
-- Allows marking an asset as a race fleet vehicle so it appears in race-fleet.html

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS is_race_fleet BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_items_race_fleet
  ON items (is_race_fleet)
  WHERE is_race_fleet = TRUE;
