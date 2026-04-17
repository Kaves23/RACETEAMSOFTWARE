-- Migration 054: Race results table + driver HR/compliance fields
-- Added: 17 April 2026

-- ═══════════════════════════════════════════════════════════
-- 1.  RACE RESULTS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS race_results (
  id                VARCHAR(36)   PRIMARY KEY,
  event_id          VARCHAR(36)   REFERENCES events(id)   ON DELETE CASCADE,
  driver_id         VARCHAR(36)   REFERENCES drivers(id)  ON DELETE SET NULL,
  session_id        VARCHAR(36)   REFERENCES race_sessions(id) ON DELETE SET NULL,
  series            VARCHAR(100),              -- e.g. "MSA Junior Karting"
  class             VARCHAR(50),               -- e.g. "OK-N"
  grid_position     INTEGER,
  finish_position   INTEGER,
  fastest_lap_ms    INTEGER,                   -- stored in ms, formatted on client
  laps_completed    INTEGER,
  dnf               BOOLEAN       DEFAULT FALSE,
  dnf_reason        VARCHAR(255),
  points            NUMERIC(6,1)  DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rr_event   ON race_results(event_id)  WHERE event_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rr_driver  ON race_results(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rr_series  ON race_results(series)    WHERE series    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rr_class   ON race_results(class)     WHERE class     IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rr_created ON race_results(created_at DESC);

DO $$ BEGIN
  CREATE TRIGGER race_results_updated_at
    BEFORE UPDATE ON race_results
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════
-- 2.  DRIVER HR / COMPLIANCE FIELDS
--     All use ADD COLUMN IF NOT EXISTS to be idempotent
-- ═══════════════════════════════════════════════════════════

-- Emergency contact (separate from guardian — for adult drivers & different purpose)
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS emergency_contact_name  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50);

-- Medical info (for marshals / ambulance crew at the circuit)
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS blood_type    VARCHAR(10),
  ADD COLUMN IF NOT EXISTS medical_notes TEXT;

-- FIA / CIK compliance document flags
-- All BOOLEAN with a companion _date field for the signed/issued date or expiry date
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS contract_signed          BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS contract_signed_date     DATE,
  ADD COLUMN IF NOT EXISTS gdpr_consent             BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gdpr_consent_date        DATE,
  ADD COLUMN IF NOT EXISTS photo_release            BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS photo_release_date       DATE,
  ADD COLUMN IF NOT EXISTS fia_entry_confirmed      BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fia_entry_date           DATE,
  ADD COLUMN IF NOT EXISTS helmet_cert_number       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS helmet_cert_expiry       DATE;

-- photo_url already added in migration 014 but guard anyway
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Indexes for compliance dashboard queries
CREATE INDEX IF NOT EXISTS idx_drivers_license_exp ON drivers(license_expiry)  WHERE license_expiry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drivers_medical_exp ON drivers(medical_expiry)  WHERE medical_expiry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drivers_consent_exp ON drivers(consent_expiry)  WHERE consent_expiry IS NOT NULL;
