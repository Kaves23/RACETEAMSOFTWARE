-- Migration 102: Practice Tracking module
-- Replaces the "KRA Practice date and track" Google Sheet.
-- Models practice sessions (date + track), per-driver attendance (a matrix cell),
-- per-session staff present, and per-driver coach. Everything ties to
-- drivers/events/staff where possible, with free-text overrides for speed.

-- ─────────────────────────────────────────────────────────────
-- Practice sessions: one row per practice day at a track/venue.
-- Optionally linked to an event; class/track free-text with lookup help.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practice_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date  DATE NOT NULL,
  track         TEXT,                    -- short code / abbreviation e.g. RSR, CPT, VKC
  venue         TEXT,                    -- optional full venue name
  event_id      TEXT REFERENCES events(id) ON DELETE SET NULL,
  class_name    TEXT,                    -- e.g. Rok, OK-J, Mini Rok
  title         TEXT,                    -- optional label, e.g. "Pre-VKC test"
  notes         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_date  ON practice_sessions (session_date);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_event ON practice_sessions (event_id);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_track ON practice_sessions (track);

-- ─────────────────────────────────────────────────────────────
-- Staff present at a session (coach / mechanic / manager, multiple).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practice_session_staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  staff_id    TEXT REFERENCES staff(id) ON DELETE SET NULL,
  staff_name  TEXT NOT NULL,             -- free-text override
  role        TEXT,                      -- coach / mechanic / manager / other
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_session_staff_session ON practice_session_staff (session_id);

-- ─────────────────────────────────────────────────────────────
-- Attendance: one row per driver per session (a matrix cell).
-- driver_id links to the profile; driver_name is a free-text override.
-- status is the colour-coded cell state.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practice_attendance (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  driver_id      TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name    TEXT NOT NULL,          -- free-text override
  status         TEXT NOT NULL DEFAULT 'attended'
                   CHECK (status IN ('planned','attended','cancelled','no_show')),
  kart           TEXT,                   -- kart run that day (override of profile default)
  engine         TEXT,                   -- engine/spec run that day
  coach_staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  coach_name     TEXT,                   -- free-text override for per-driver coach
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_attendance_session ON practice_attendance (session_id);
CREATE INDEX IF NOT EXISTS idx_practice_attendance_driver  ON practice_attendance (driver_id);

-- At most one attendance row per linked driver per session (override rows with
-- NULL driver_id are matched on name in application logic).
CREATE UNIQUE INDEX IF NOT EXISTS uq_practice_attendance_session_driver
  ON practice_attendance (session_id, driver_id)
  WHERE driver_id IS NOT NULL;
