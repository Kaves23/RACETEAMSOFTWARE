-- Migration 057: Add password_hash to users table and seed admin account
-- Created: 20 April 2026

-- Add password_hash column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Seed a default admin user (password will be set by the server on first run)
-- The actual bcrypt hash is generated at server start via the seed script in auth.js
INSERT INTO users (id, username, email, full_name, role, is_active)
VALUES (
  'admin-001',
  'admin',
  'admin@raceteam.local',
  'Administrator',
  'admin',
  TRUE
)
ON CONFLICT (id) DO NOTHING;
