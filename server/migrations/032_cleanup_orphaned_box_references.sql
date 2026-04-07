-- Migration 032: Clean up orphaned current_box_id references
-- Items/inventory rows that still point to boxes that were deleted

UPDATE items
SET current_box_id = NULL, updated_at = NOW()
WHERE current_box_id IS NOT NULL
  AND current_box_id NOT IN (SELECT id FROM boxes);

UPDATE inventory
SET current_box_id = NULL, updated_at = NOW()
WHERE current_box_id IS NOT NULL
  AND current_box_id NOT IN (SELECT id FROM boxes);
