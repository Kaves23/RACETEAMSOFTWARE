-- Migration 025: Add missing inventory fields
-- Created: 2026-04-06
-- Adds fields that the inventory UI is sending but don't exist in schema

-- Add unit_of_measure (rename from unit for clarity)
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(50);

-- Copy existing unit data to unit_of_measure if it doesn't exist yet
UPDATE inventory 
SET unit_of_measure = unit 
WHERE unit_of_measure IS NULL AND unit IS NOT NULL;

-- Add lead time tracking
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 0;

-- Add auto reorder flag
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS auto_reorder BOOLEAN DEFAULT false;

-- Add last used date tracking
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS last_used_date DATE;

-- Add index for auto reorder queries
CREATE INDEX IF NOT EXISTS idx_inventory_auto_reorder ON inventory(auto_reorder) WHERE auto_reorder = true;

-- Migration complete
