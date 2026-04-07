-- Migration 030: Clean up old driver columns
-- Drop any legacy driver columns that might conflict with racing_class

-- Drop old category column if it exists (from original migration 010)
ALTER TABLE drivers DROP COLUMN IF EXISTS category;

-- Drop old class column if it exists  
ALTER TABLE drivers DROP COLUMN IF EXISTS class;

-- Ensure racing_class exists (should already exist from migration 014/022)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS racing_class VARCHAR(100);

-- Ensure color column exists (from migration 029)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#ea4335';

COMMENT ON COLUMN drivers.racing_class IS 'Driver racing class (e.g., OK-N, OK-J, Mini)';
COMMENT ON COLUMN drivers.color IS 'Driver box color in hex format';
