-- Migration 026: Add location_distribution field for multi-location inventory tracking
-- This allows items to be tracked across multiple locations with quantities per location

ALTER TABLE inventory
ADD COLUMN IF NOT EXISTS location_distribution JSONB DEFAULT '{}';

-- Add index for querying location distribution
CREATE INDEX IF NOT EXISTS idx_inventory_location_distribution 
ON inventory USING GIN (location_distribution);

-- Add comment
COMMENT ON COLUMN inventory.location_distribution IS 'JSONB object mapping location names to quantities: {"CT.Engine Room": 5, "CT.Trailer": 3}';
