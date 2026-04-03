-- Migration 007: Asset Types Table
-- Created: 3 April 2026
-- Purpose: Store asset types and their associated colors for consistent use across the application

-- ============================================
-- ASSET TYPES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS asset_types (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  color VARCHAR(7) NOT NULL,  -- Hex color format #RRGGBB
  description TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_types_name ON asset_types(name);
CREATE INDEX IF NOT EXISTS idx_asset_types_active ON asset_types(is_active);
CREATE INDEX IF NOT EXISTS idx_asset_types_sort ON asset_types(sort_order);

-- ============================================
-- SEED DEFAULT ASSET TYPES
-- ============================================

-- Insert default asset types with colors matching current settings
INSERT INTO asset_types (id, name, color, sort_order) VALUES
  ('at-1', 'Equipment', '#0ea5e9', 1),
  ('at-2', 'Asset', '#a855f7', 2),
  ('at-3', 'Brakes', '#ff6d00', 3),
  ('at-4', 'Engine', '#9334e6', 4),
  ('at-5', 'Cooling', '#06b6d4', 5),
  ('at-6', 'Filters', '#84cc16', 6),
  ('at-7', 'Diagnostics', '#f59e0b', 7),
  ('at-8', 'Lifting', '#ec4899', 8)
ON CONFLICT (name) 
DO UPDATE SET
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;
