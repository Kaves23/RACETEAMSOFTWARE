-- Migration 068: Fleet Management System
-- Adds vehicle identity, service scheduling, compliance docs tracking,
-- and three new tables: vehicle_service_logs, vehicle_fuel_logs, vehicle_trips
-- Created: 23 April 2026

-- ===================================================================
-- 1. Add new columns to trucks table
-- ===================================================================
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN make VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN model VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN year SMALLINT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN colour VARCHAR(60); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN fuel_type VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN current_odometer_km DECIMAL(10,1) DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Service scheduling (both km and date based)
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN service_interval_km INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN service_interval_months INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN last_service_date DATE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN last_service_km DECIMAL(10,1); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN next_service_date DATE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN next_service_km DECIMAL(10,1); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Compliance documents (expiry dates + notes)
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN insurance_expiry DATE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN insurance_notes TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN roadworthy_expiry DATE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN roadworthy_notes TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE trucks ADD COLUMN licence_disc_expiry DATE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ===================================================================
-- 2. vehicle_service_logs — one row per service event
-- ===================================================================
CREATE TABLE IF NOT EXISTS vehicle_service_logs (
  id                 VARCHAR(36)    PRIMARY KEY,
  truck_id           VARCHAR(36)    NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  service_date       DATE           NOT NULL,
  odometer_km        DECIMAL(10,1),
  service_type       VARCHAR(50)    NOT NULL DEFAULT 'routine',
    -- routine | repair | inspection | tyre | electrical | bodywork | other
  description        TEXT,
  cost_zar           DECIMAL(12,2),
  performed_by       VARCHAR(200),
  next_service_date  DATE,
  next_service_km    DECIMAL(10,1),
  notes              TEXT,
  created_at         TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vsl_truck ON vehicle_service_logs(truck_id);
CREATE INDEX IF NOT EXISTS idx_vsl_date  ON vehicle_service_logs(service_date DESC);

-- ===================================================================
-- 3. vehicle_fuel_logs — one row per fuel fill
-- ===================================================================
CREATE TABLE IF NOT EXISTS vehicle_fuel_logs (
  id              VARCHAR(36)    PRIMARY KEY,
  truck_id        VARCHAR(36)    NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  filled_at       TIMESTAMP      NOT NULL DEFAULT NOW(),
  odometer_km     DECIMAL(10,1),
  litres          DECIMAL(8,2),
  cost_per_litre  DECIMAL(8,4),
  total_cost_zar  DECIMAL(12,2),
  station_name    VARCHAR(200),
  notes           TEXT,
  created_at      TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vfl_truck ON vehicle_fuel_logs(truck_id);
CREATE INDEX IF NOT EXISTS idx_vfl_date  ON vehicle_fuel_logs(filled_at DESC);

-- ===================================================================
-- 4. vehicle_trips — one row per journey
-- ===================================================================
CREATE TABLE IF NOT EXISTS vehicle_trips (
  id                  VARCHAR(36)    PRIMARY KEY,
  truck_id            VARCHAR(36)    NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  event_id            VARCHAR(36)    REFERENCES events(id) ON DELETE SET NULL,
  driver_name         VARCHAR(200),
  departure_from      VARCHAR(255),
  arrival_to          VARCHAR(255),
  departure_at        TIMESTAMP,
  arrival_at          TIMESTAMP,
  start_odometer_km   DECIMAL(10,1),
  end_odometer_km     DECIMAL(10,1),
  notes               TEXT,
  created_at          TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vt_truck ON vehicle_trips(truck_id);
CREATE INDEX IF NOT EXISTS idx_vt_event ON vehicle_trips(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vt_date  ON vehicle_trips(departure_at DESC);
