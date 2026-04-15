-- Migration 052: Asset flag / "needs attention" system
-- Adds is_flagged and flag_reason columns to items table

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flag_reason VARCHAR(500);

-- Index for quick lookup of all flagged assets
CREATE INDEX IF NOT EXISTS idx_items_is_flagged ON items(is_flagged) WHERE is_flagged = TRUE;
