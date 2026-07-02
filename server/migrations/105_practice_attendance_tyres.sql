-- Migration 105: Tyre usage on practice attendance
-- Tracks which tyre brand and size a driver used on a specific practice/race day.

ALTER TABLE practice_attendance ADD COLUMN IF NOT EXISTS tyre_brand TEXT;
ALTER TABLE practice_attendance ADD COLUMN IF NOT EXISTS tyre_size TEXT;

ALTER TABLE practice_attendance DROP CONSTRAINT IF EXISTS practice_attendance_tyre_brand_check;
ALTER TABLE practice_attendance ADD CONSTRAINT practice_attendance_tyre_brand_check
  CHECK (tyre_brand IS NULL OR tyre_brand IN ('Levanto','Mojo'));

ALTER TABLE practice_attendance DROP CONSTRAINT IF EXISTS practice_attendance_tyre_size_check;
ALTER TABLE practice_attendance ADD CONSTRAINT practice_attendance_tyre_size_check
  CHECK (tyre_size IS NULL OR tyre_size IN ('Mini','Senior'));

CREATE INDEX IF NOT EXISTS idx_practice_attendance_tyre_brand ON practice_attendance (tyre_brand);
CREATE INDEX IF NOT EXISTS idx_practice_attendance_tyre_size ON practice_attendance (tyre_size);
