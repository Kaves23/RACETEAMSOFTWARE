-- Migration 101: Manual drag-to-reorder support for academy prospects
ALTER TABLE academy_prospects ADD COLUMN IF NOT EXISTS sort_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_academy_prospects_sort_order ON academy_prospects (sort_order);
