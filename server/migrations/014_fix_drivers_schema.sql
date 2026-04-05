-- Migration 014: Fix Drivers Schema & Add Many-to-Many Relationships
-- This migration aligns the drivers table with the UI and creates proper relationship tables

-- ============================================
-- STEP 1: Add missing columns to drivers table
-- ============================================

-- Racing-specific fields
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS racing_class VARCHAR(100),
ADD COLUMN IF NOT EXISTS race_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS guardian_email VARCHAR(255);

-- License and compliance fields  
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS license_expiry DATE,
ADD COLUMN IF NOT EXISTS medical_expiry DATE,
ADD COLUMN IF NOT EXISTS consent_expiry DATE;

-- Flexible fields for tags and availability
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS availability JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Driver profile photo
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- ============================================
-- STEP 2: Create indexes for new columns
-- ============================================

CREATE INDEX IF NOT EXISTS idx_drivers_racing_class ON drivers(racing_class);
CREATE INDEX IF NOT EXISTS idx_drivers_race_number ON drivers(race_number);
CREATE INDEX IF NOT EXISTS idx_drivers_tags ON drivers USING GIN (tags);

-- ============================================
-- STEP 3: Create Many-to-Many Relationship Tables
-- ============================================

-- DRIVER <-> EVENTS (many-to-many)
CREATE TABLE IF NOT EXISTS driver_events (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  driver_id VARCHAR(36) NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  event_id VARCHAR(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role VARCHAR(100),  -- e.g., "Primary Driver", "Reserve", "Practice Only"
  confirmed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(driver_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_events_driver ON driver_events(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_events_event ON driver_events(event_id);

-- DRIVER <-> ITEMS (many-to-many) - track items assigned to drivers
CREATE TABLE IF NOT EXISTS driver_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  driver_id VARCHAR(36) NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  item_id VARCHAR(36) NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  returned_at TIMESTAMP,
  condition_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(driver_id, item_id, assigned_at)
);

CREATE INDEX IF NOT EXISTS idx_driver_items_driver ON driver_items(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_items_item ON driver_items(item_id);
CREATE INDEX IF NOT EXISTS idx_driver_items_active ON driver_items(driver_id, item_id) WHERE returned_at IS NULL;

-- DRIVER <-> TASKS (many-to-many) - assign tasks to drivers
CREATE TABLE IF NOT EXISTS driver_tasks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  driver_id VARCHAR(36) NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  task_id VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  assigned_by VARCHAR(36),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(driver_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_tasks_driver ON driver_tasks(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_tasks_task ON driver_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_driver_tasks_pending ON driver_tasks(driver_id) WHERE completed_at IS NULL;

-- STAFF table (for proper staff vs driver separation)
CREATE TABLE IF NOT EXISTS staff (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100),  -- "Mechanic", "Engineer", "Team Manager", etc.
  email VARCHAR(255),
  phone VARCHAR(50),
  emergency_contact TEXT,
  specializations JSONB DEFAULT '[]'::jsonb,  -- ["Engine Specialist", "Electronics"]
  certifications JSONB DEFAULT '[]'::jsonb,   -- License types, safety certs
  status VARCHAR(50) DEFAULT 'active',
  photo_url TEXT,
  hire_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);
CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status);

-- STAFF <-> EVENTS (many-to-many)
CREATE TABLE IF NOT EXISTS staff_events (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  staff_id VARCHAR(36) NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  event_id VARCHAR(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role VARCHAR(100),  -- Role for this specific event
  confirmed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_events_staff ON staff_events(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_events_event ON staff_events(event_id);

-- ============================================
-- STEP 4: Add helpful comments
-- ============================================

COMMENT ON TABLE driver_events IS 'Many-to-many: Drivers assigned to events';
COMMENT ON TABLE driver_items IS 'Many-to-many: Items checked out to drivers with return tracking';
COMMENT ON TABLE driver_tasks IS 'Many-to-many: Tasks assigned to drivers';
COMMENT ON TABLE staff IS 'Team staff members (mechanics, engineers, managers)';
COMMENT ON TABLE staff_events IS 'Many-to-many: Staff assigned to events';

COMMENT ON COLUMN drivers.tags IS 'Array of tags like ["Academy", "Senior", "OK-N"]';
COMMENT ON COLUMN drivers.availability IS 'JSON object for availability tracking';
COMMENT ON COLUMN drivers.attachments IS 'Array of attachment metadata';
COMMENT ON COLUMN staff.specializations IS 'Array of staff specializations';
COMMENT ON COLUMN staff.certifications IS 'Array of certifications and licenses';
