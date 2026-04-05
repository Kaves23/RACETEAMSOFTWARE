-- Migration 012: Add Box Tracking to Inventory Table
-- Allows inventory items to be tracked in boxes just like equipment/assets

-- Add current_box_id to inventory table
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS current_box_id VARCHAR(36) REFERENCES boxes(id) ON DELETE SET NULL;

-- Add index for faster box content lookups
CREATE INDEX IF NOT EXISTS idx_inventory_current_box ON inventory(current_box_id);

-- Add comment
COMMENT ON COLUMN inventory.current_box_id IS 'Current box containing this inventory item (if packed)';
