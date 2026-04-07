-- Migration 031: Replace generic seeded locations with real team locations
-- Created: 2026-04-07

-- Remove all generic placeholder locations from migration 009
DELETE FROM locations WHERE id IN (
  'loc_warehouse', 'loc_paddock', 'loc_garage', 'loc_storage',
  'loc_truck_1', 'loc_truck_2', 'loc_workshop', 'loc_pit_area', 'loc_office'
);

-- Insert real team locations
INSERT INTO locations (id, name, location_type, address, city, country, is_active, created_at, updated_at)
VALUES
  ('loc_dir',             'Derick Irving Racing', 'warehouse',       NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_truck',           'Truck',                'vehicle',         NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_ct_garage',       'CT.Garage',            'workshop',        NULL, 'Cape Town', 'South Africa', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_ct_engine_room',  'CT.Engine Room',       'workshop',        NULL, 'Cape Town', 'South Africa', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_ct_store',        'CT.Store',             'storage',         NULL, 'Cape Town', 'South Africa', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_jhb_garage',      'JHB.Garage',           'workshop',        NULL, 'Johannesburg', 'South Africa', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_jhb_store',       'JHB.Store',            'storage',         NULL, 'Johannesburg', 'South Africa', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  location_type= EXCLUDED.location_type,
  city         = EXCLUDED.city,
  country      = EXCLUDED.country,
  is_active    = EXCLUDED.is_active,
  updated_at   = CURRENT_TIMESTAMP;
