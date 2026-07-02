-- Migration 106: Multiple tyre sets per practice attendance
-- Keeps the quick primary tyre columns, and stores the full per-driver tyre
-- allocation as JSON for cases like two slick sets plus wet tyres.

ALTER TABLE practice_attendance ADD COLUMN IF NOT EXISTS tyre_type TEXT;
ALTER TABLE practice_attendance ADD COLUMN IF NOT EXISTS tyre_sets JSONB;

ALTER TABLE practice_attendance DROP CONSTRAINT IF EXISTS practice_attendance_tyre_type_check;
ALTER TABLE practice_attendance ADD CONSTRAINT practice_attendance_tyre_type_check
  CHECK (tyre_type IS NULL OR tyre_type IN ('Slick','Wet'));

CREATE INDEX IF NOT EXISTS idx_practice_attendance_tyre_type ON practice_attendance (tyre_type);
CREATE INDEX IF NOT EXISTS idx_practice_attendance_tyre_sets ON practice_attendance USING GIN (tyre_sets);
