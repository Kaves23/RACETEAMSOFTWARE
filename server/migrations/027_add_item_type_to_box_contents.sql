-- Migration 027: Add item_type to box_contents for multi-table support
-- This enables tracking items from different tables (items, inventory) in boxes

-- Add item_type column if it doesn't exist
ALTER TABLE box_contents 
ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'equipment';

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_box_contents_item_type 
ON box_contents(item_type);

-- Backfill item_type for existing inventory records
UPDATE box_contents 
SET item_type = 'inventory' 
WHERE item_id IN (SELECT id FROM inventory);

-- Backfill item_type for existing equipment/asset records
UPDATE box_contents 
SET item_type = 'equipment' 
WHERE item_type IS NULL OR item_type = '' 
  OR item_id IN (SELECT id FROM items);

-- Clean orphan box_contents entries (items/boxes that no longer exist)
DELETE FROM box_contents 
WHERE box_id NOT IN (SELECT id FROM boxes);

DELETE FROM box_contents 
WHERE item_type = 'equipment' 
  AND item_id NOT IN (SELECT id FROM items);

DELETE FROM box_contents 
WHERE item_type = 'inventory' 
  AND item_id NOT IN (SELECT id FROM inventory);

-- Clean orphan current_box_id references in items table
UPDATE items 
SET current_box_id = NULL, updated_at = NOW()
WHERE current_box_id IS NOT NULL 
  AND current_box_id NOT IN (SELECT id FROM boxes);

-- Clean orphan current_box_id references in inventory table
UPDATE inventory 
SET current_box_id = NULL, updated_at = NOW()
WHERE current_box_id IS NOT NULL 
  AND current_box_id NOT IN (SELECT id FROM boxes);

-- Sync items.current_box_id to box_contents for consistency
-- Add entries to box_contents for items that have current_box_id but no box_contents entry
INSERT INTO box_contents (box_id, item_id, item_type, packed_at)
SELECT 
  i.current_box_id, 
  i.id, 
  'equipment',
  NOW()
FROM items i
WHERE i.current_box_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM box_contents bc 
    WHERE bc.item_id = i.id AND bc.box_id = i.current_box_id
  )
ON CONFLICT (box_id, item_id) DO NOTHING;

-- Sync inventory.current_box_id to box_contents for consistency
INSERT INTO box_contents (box_id, item_id, item_type, packed_at)
SELECT 
  inv.current_box_id, 
  inv.id, 
  'inventory',
  NOW()
FROM inventory inv
WHERE inv.current_box_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM box_contents bc 
    WHERE bc.item_id = inv.id AND bc.box_id = inv.current_box_id
  )
ON CONFLICT (box_id, item_id) DO NOTHING;
