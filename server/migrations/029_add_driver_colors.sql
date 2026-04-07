-- Migration 029: Add color field to drivers for box customization
-- Allows each driver to have a custom color that is used for their assigned boxes

-- Add color column to drivers table
ALTER TABLE drivers 
ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#ea4335';

-- Create index for color field (useful for filtering/grouping)
CREATE INDEX IF NOT EXISTS idx_drivers_color ON drivers(color);

-- Set some default colors for existing drivers if they don't have one
-- Distribute colors across the spectrum for visual differentiation
WITH driver_colors AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (ORDER BY created_at, id) as rn
  FROM drivers
  WHERE color IS NULL OR color = ''
)
UPDATE drivers d
SET color = CASE 
    -- Red family
    WHEN dc.rn % 10 = 1 THEN '#ea4335'  -- Google Red
    WHEN dc.rn % 10 = 2 THEN '#9334e6'  -- Purple
    WHEN dc.rn % 10 = 3 THEN '#1a73e8'  -- Blue
    WHEN dc.rn % 10 = 4 THEN '#00bcd4'  -- Cyan
    WHEN dc.rn % 10 = 5 THEN '#34a853'  -- Green
    WHEN dc.rn % 10 = 6 THEN '#fbbc04'  -- Yellow
    WHEN dc.rn % 10 = 7 THEN '#ff6d00'  -- Orange
    WHEN dc.rn % 10 = 8 THEN '#e91e63'  -- Pink
    WHEN dc.rn % 10 = 9 THEN '#673ab7'  -- Deep Purple
    ELSE '#f4511e'                       -- Deep Orange
  END
FROM driver_colors dc
WHERE d.id = dc.id;

COMMENT ON COLUMN drivers.color IS 'Hex color code for driver box styling (default: #ea4335 red)';
