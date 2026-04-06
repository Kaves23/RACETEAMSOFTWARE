-- Migration 022: Add missing driver fields
-- Created: 2026-04-06
-- Adds racing_class, race_number, guardian fields, and tags to drivers table

ALTER TABLE drivers 
ADD COLUMN IF NOT EXISTS racing_class VARCHAR(100),
ADD COLUMN IF NOT EXISTS race_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS tags TEXT;

CREATE INDEX IF NOT EXISTS idx_drivers_racing_class ON drivers(racing_class);
CREATE INDEX IF NOT EXISTS idx_drivers_race_number ON drivers(race_number);

-- Migration complete
