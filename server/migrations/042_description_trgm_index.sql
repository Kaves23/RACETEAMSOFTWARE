-- Migration 042: Trigram index on items.description
-- Issue: GET /api/items?search=X includes description ILIKE $1 but only
--        name and barcode have GIN trgm indexes (from migration 039).
--        A search that matches "description" does a full table seqscan.
-- Fix: Add a partial GIN trgm index on items.description (non-null rows only).

CREATE INDEX IF NOT EXISTS idx_items_description_trgm
  ON items USING gin(description gin_trgm_ops)
  WHERE description IS NOT NULL AND description <> '';
