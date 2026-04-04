-- Migration 008: Add Custom Asset Types
-- Created: 4 April 2026
-- Purpose: Add all custom asset types that are actually being used by items

-- Insert custom asset types based on actual usage patterns
INSERT INTO asset_types (id, name, color, sort_order) VALUES
  -- Engines (cyan/blue tones)
  ('at-9', 'Engine Vortex Mini', '#06b6d4', 10),
  ('at-10', 'Engine Vortex OK-J', '#0ea5e9', 11),
  ('at-11', 'Engine Vortex OK-N', '#3b82f6', 12),
  ('at-12', 'Engine Rotax Junior Max', '#ec4899', 13),
  
  -- Exhausts (orange/purple tones)
  ('at-13', 'Exhaust (OK-J)', '#f59e0b', 20),
  ('at-14', 'Exhaust (OK-N)', '#a855f7', 21),
  
  -- Spares (green tones)
  ('at-15', 'Engine Spares (Radiators)', '#10b981', 30),
  ('at-16', 'Engine Spares ()', '#059669', 31),
  
  -- Karts (lime green)
  ('at-17', 'Kart OK OTK', '#84cc16', 40),
  
  -- Tools (emerald)
  ('at-18', 'Tools (Powered)', '#22c55e', 50),
  
  -- Data/Diagnostics (amber)
  ('at-19', 'Data (Timing)', '#f59e0b', 60)
  
ON CONFLICT (name) 
DO UPDATE SET
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;

-- Update any items with old naming conventions to match new asset type names
-- This ensures backward compatibility
