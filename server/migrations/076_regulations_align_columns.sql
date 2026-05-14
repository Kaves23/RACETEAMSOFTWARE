-- Align regulations columns with the UI (governing_body, doc_type, linked_event, summary)
ALTER TABLE regulations
  ADD COLUMN IF NOT EXISTS governing_body TEXT,
  ADD COLUMN IF NOT EXISTS doc_type       TEXT,
  ADD COLUMN IF NOT EXISTS linked_event   TEXT,
  ADD COLUMN IF NOT EXISTS summary        TEXT;

-- Backfill from legacy columns if they exist
UPDATE regulations SET governing_body = series          WHERE governing_body IS NULL AND series IS NOT NULL;
UPDATE regulations SET doc_type       = regulation_type WHERE doc_type       IS NULL AND regulation_type IS NOT NULL;
UPDATE regulations SET summary        = notes           WHERE summary        IS NULL AND notes IS NOT NULL;
