-- Migration 078: Academy prospects CRM
CREATE TABLE IF NOT EXISTS academy_prospects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name  TEXT NOT NULL,
  driver_dob   DATE,
  category     TEXT,
  nationality  TEXT,
  parent_name  TEXT,
  parent_phone TEXT,
  parent_email TEXT,
  source       TEXT,
  assigned_to  TEXT,
  status       TEXT NOT NULL DEFAULT 'lead'
               CHECK (status IN ('lead','qualified','booked','testing','post_review','offer_made','signed','cancelled')),
  notes        TEXT,
  sessions     JSONB NOT NULL DEFAULT '[]',
  attachments  JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_prospects_status ON academy_prospects (status);
CREATE INDEX IF NOT EXISTS idx_academy_prospects_driver_name ON academy_prospects (driver_name);
