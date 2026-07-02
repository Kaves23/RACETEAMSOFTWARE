-- Migration 107: Driver tyre usage backlog
-- Manual/backlog tyre usage entries per driver. Practice schedule tyre usage
-- remains stored on practice_attendance and is surfaced through the API.

CREATE TABLE IF NOT EXISTS driver_tyre_usage (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name         TEXT NOT NULL,
  usage_date          DATE,
  tyre_brand          TEXT CHECK (tyre_brand IS NULL OR tyre_brand IN ('Levanto','Mojo')),
  tyre_size           TEXT CHECK (tyre_size IS NULL OR tyre_size IN ('Mini','Senior')),
  tyre_type           TEXT CHECK (tyre_type IS NULL OR tyre_type IN ('Slick','Wet')),
  sets_used           INTEGER NOT NULL DEFAULT 1 CHECK (sets_used >= 1 AND sets_used <= 99),
  practice_session_id UUID REFERENCES practice_sessions(id) ON DELETE SET NULL,
  event_id            TEXT REFERENCES events(id) ON DELETE SET NULL,
  source              TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','backlog')),
  notes               TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_tyre_usage_driver ON driver_tyre_usage (driver_id, LOWER(driver_name));
CREATE INDEX IF NOT EXISTS idx_driver_tyre_usage_date ON driver_tyre_usage (usage_date);
CREATE INDEX IF NOT EXISTS idx_driver_tyre_usage_event ON driver_tyre_usage (event_id);
CREATE INDEX IF NOT EXISTS idx_driver_tyre_usage_practice ON driver_tyre_usage (practice_session_id);
