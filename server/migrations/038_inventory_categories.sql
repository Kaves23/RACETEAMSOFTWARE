-- Migration 038: Create inventory_categories table
-- Replaces hardcoded category list with a DB-managed table

CREATE TABLE IF NOT EXISTS inventory_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default categories (match the old hardcoded defaults)
INSERT INTO inventory_categories (id, name, sort_order) VALUES
  ('cat_consumables', 'Consumables', 0),
  ('cat_spares',      'Spares',      1),
  ('cat_tyres',       'Tyres',       2),
  ('cat_tools',       'Tools & PPE', 3)
ON CONFLICT (id) DO NOTHING;
