-- Migration 013: Add Driver Boxes Support
-- Adds box_type field to distinguish between regular boxes and driver boxes
-- Adds assigned_driver_id to track which driver a box is assigned to

-- Add box_type to boxes table
ALTER TABLE boxes 
ADD COLUMN IF NOT EXISTS box_type VARCHAR(50) DEFAULT 'regular';

-- Add assigned_driver_id to boxes table (references drivers table)
ALTER TABLE boxes 
ADD COLUMN IF NOT EXISTS assigned_driver_id VARCHAR(36) REFERENCES drivers(id) ON DELETE SET NULL;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_boxes_type ON boxes(box_type);
CREATE INDEX IF NOT EXISTS idx_boxes_assigned_driver ON boxes(assigned_driver_id);

-- Add comments
COMMENT ON COLUMN boxes.box_type IS 'Type of box: regular or driver (driver boxes have red border/glow UI)';
COMMENT ON COLUMN boxes.assigned_driver_id IS 'Driver this box is assigned to (for driver boxes)';

-- Update existing boxes to be regular type
UPDATE boxes SET box_type = 'regular' WHERE box_type IS NULL;
