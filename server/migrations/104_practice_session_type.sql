-- Migration 104: Session type (practice vs race day)
-- Most logged days are practice, but the odd one is a race day. Storing the
-- type lets the matrix flag race days distinctly while keeping practice as the
-- default so nothing changes for existing rows.

ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'practice';
