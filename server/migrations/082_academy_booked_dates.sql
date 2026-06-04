-- Migration 082: Add booked_dates JSONB column to academy_prospects
ALTER TABLE academy_prospects
  ADD COLUMN IF NOT EXISTS booked_dates JSONB NOT NULL DEFAULT '[]';
