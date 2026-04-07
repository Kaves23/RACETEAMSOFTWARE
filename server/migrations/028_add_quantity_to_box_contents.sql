-- Migration 028: Add quantity tracking to box_contents for inventory items
-- Allows packing different quantities of the same inventory item into multiple boxes

-- Add quantity_packed column for tracking how many units are in each box
ALTER TABLE box_contents 
ADD COLUMN IF NOT EXISTS quantity_packed INTEGER DEFAULT 1;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_box_contents_quantity 
ON box_contents(item_type, quantity_packed);

-- Set default quantity to 1 for existing non-inventory items
UPDATE box_contents 
SET quantity_packed = 1 
WHERE quantity_packed IS NULL OR quantity_packed = 0;

-- Remove the unique constraint on (box_id, item_id) to allow same item in multiple boxes
-- First, drop the existing primary key
ALTER TABLE box_contents DROP CONSTRAINT IF EXISTS box_contents_pkey;

-- Add a new ID column as primary key
ALTER TABLE box_contents 
ADD COLUMN IF NOT EXISTS id VARCHAR(36) DEFAULT gen_random_uuid()::text;

-- Make id the primary key
ALTER TABLE box_contents 
ADD PRIMARY KEY (id);

-- Add a unique constraint only for equipment/asset items (they can only be in one box)
-- Inventory items can be in multiple boxes with different quantities
CREATE UNIQUE INDEX IF NOT EXISTS idx_box_contents_unique_equipment 
ON box_contents(box_id, item_id) 
WHERE item_type != 'inventory';

-- Add check constraint to ensure quantity is positive
ALTER TABLE box_contents 
ADD CONSTRAINT check_quantity_positive 
CHECK (quantity_packed > 0);

COMMENT ON COLUMN box_contents.quantity_packed IS 'Number of units packed (for inventory items). Always 1 for equipment/assets.';
