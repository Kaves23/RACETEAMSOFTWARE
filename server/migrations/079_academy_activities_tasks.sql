-- Migration 079: Add activities and tasks JSONB columns to academy_prospects
ALTER TABLE academy_prospects
  ADD COLUMN IF NOT EXISTS activities JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tasks      JSONB NOT NULL DEFAULT '[]';
