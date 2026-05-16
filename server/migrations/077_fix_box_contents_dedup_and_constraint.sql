-- Migration 077: Fix box_contents duplicate rows and add unique constraint
-- 
-- Root cause: migration 027 used ON CONFLICT (box_id, item_id) before the
-- unique constraint existed (created in 036), and duplicate rows accumulated.
-- Migration 036 then failed to add the constraint because of those duplicates.
--
-- This migration deduplicates box_contents then (re)creates the constraint.

-- Step 1: Remove duplicate rows, keeping only the most recently packed entry
DELETE FROM box_contents
WHERE ctid NOT IN (
  SELECT MAX(ctid)
  FROM box_contents
  GROUP BY box_id, item_id
);

-- Step 2: Add the unique constraint (skip if already present)
DO $$ BEGIN
  ALTER TABLE box_contents
    ADD CONSTRAINT uq_box_contents_box_item UNIQUE (box_id, item_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table  THEN NULL;
END $$;
