-- Migration 034: Data quality fixes + DB constraints
-- Fix 1: Clear current_box_id for 6 "ghost" items that claim to be in a box
--        but have no matching row in box_contents (MINI CT POOL x4, HAND DRILL x2)
UPDATE items
SET current_box_id = NULL, updated_at = NOW()
WHERE current_box_id IS NOT NULL
  AND id NOT IN (
    SELECT item_id FROM box_contents WHERE item_type != 'inventory'
  );

-- Fix 2: Assign 4 "lost" items (no location, no box) to CT.Garage
UPDATE items
SET current_location_id = 'loc_ct_garage', updated_at = NOW()
WHERE current_box_id IS NULL
  AND current_location_id IS NULL;

-- Fix 4: Drop duplicate indexes on box_contents
-- idx_box_contents_box and idx_box_contents_box_id are identical (both on box_id)
-- idx_box_contents_item and idx_box_contents_item_id are identical (both on item_id)
DROP INDEX IF EXISTS idx_box_contents_box_id;
DROP INDEX IF EXISTS idx_box_contents_item_id;

-- Fix 5: Add CHECK constraints on status columns
ALTER TABLE items
  ADD CONSTRAINT chk_items_status
  CHECK (status IN ('available', 'in_use', 'maintenance', 'retired', 'lost', 'warehouse'));

ALTER TABLE boxes
  ADD CONSTRAINT chk_boxes_status
  CHECK (status IN ('available', 'warehouse', 'in_use', 'packed', 'in_transit', 'maintenance'));

ALTER TABLE drivers
  ADD CONSTRAINT chk_drivers_status
  CHECK (status IN ('active', 'inactive', 'suspended'));

-- Fix 6: Add FK boxes.current_truck_id → trucks (was missing from migration 033)
ALTER TABLE boxes
  ADD CONSTRAINT fk_boxes_current_truck
  FOREIGN KEY (current_truck_id) REFERENCES trucks(id) ON DELETE SET NULL;

-- Fix 7: Add CHECK constraint to prevent negative inventory quantities
ALTER TABLE inventory
  ADD CONSTRAINT chk_inventory_quantity_non_negative
  CHECK (quantity >= 0);
