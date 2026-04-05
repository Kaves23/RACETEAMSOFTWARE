-- Migration 020: Optimize box_contents queries
-- Add index on packed_at for faster ORDER BY

CREATE INDEX IF NOT EXISTS idx_box_contents_packed_at ON box_contents(packed_at DESC);

-- Composite index for the full query pattern (box_id + packed_at)
-- This helps when filtering by box and ordering by pack time
CREATE INDEX IF NOT EXISTS idx_box_contents_box_packed ON box_contents(box_id, packed_at DESC);
