-- Migration 067: Fix box_contents unique constraint to allow variant lines
-- Problem: migration 036 added UNIQUE(box_id, item_id) on box_contents.
--          When a parent inventory item has multiple sizes (variants), each size
--          is stored as a separate row sharing the same item_id but with a
--          different variant_label.  The old constraint causes a duplicate-key
--          error on the second variant being packed into the same box.
--
-- Solution: drop the blanket constraint and replace it with three precise
--           partial unique indexes:
--   1. Non-inventory items (equipment/assets) → still 1 row per (box, item).
--   2. Inventory items WITHOUT a variant    → 1 row per (box, item) where label IS NULL.
--   3. Inventory items WITH a variant       → 1 row per (box, item, label) so every
--                                             size can appear independently.
-- Created: 23 April 2026

-- ── Step 1: drop the old blanket constraint ──────────────────────────────────
DO $$ BEGIN
  ALTER TABLE box_contents DROP CONSTRAINT IF EXISTS uq_box_contents_box_item;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── Step 2: equipment / asset — one box per item ─────────────────────────────
DROP INDEX IF EXISTS idx_bc_unique_equipment;
CREATE UNIQUE INDEX idx_bc_unique_equipment
  ON box_contents (box_id, item_id)
  WHERE item_type != 'inventory';

-- ── Step 3: inventory with NO variant — one row per (box, item) ──────────────
DROP INDEX IF EXISTS idx_bc_unique_inv_no_variant;
CREATE UNIQUE INDEX idx_bc_unique_inv_no_variant
  ON box_contents (box_id, item_id)
  WHERE item_type = 'inventory' AND variant_label IS NULL;

-- ── Step 4: inventory WITH a variant — one row per (box, item, variant) ──────
DROP INDEX IF EXISTS idx_bc_unique_inv_variant;
CREATE UNIQUE INDEX idx_bc_unique_inv_variant
  ON box_contents (box_id, item_id, variant_label)
  WHERE item_type = 'inventory' AND variant_label IS NOT NULL;
