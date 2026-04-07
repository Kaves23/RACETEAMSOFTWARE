-- Migration 037: Add notes column to trucks table
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
