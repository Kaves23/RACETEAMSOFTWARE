-- Add test_venue column to academy_prospects
ALTER TABLE academy_prospects
  ADD COLUMN IF NOT EXISTS test_venue VARCHAR(100);
