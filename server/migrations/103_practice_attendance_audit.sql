-- Migration 103: Attendance audit trail
-- Track who last changed each attendance cell so the matrix stays a
-- trustworthy source of truth (and one user can see who set a mark before
-- clearing it). updated_at already exists on the table.

ALTER TABLE practice_attendance ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE practice_attendance ADD COLUMN IF NOT EXISTS updated_by TEXT;
