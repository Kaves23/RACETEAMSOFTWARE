-- Migration 009: Seed common locations for race team logistics
-- Created: 2026-04-04

-- Insert common race team locations
INSERT INTO locations (id, name, location_type, address, city, country, is_active, created_at, updated_at)
VALUES
  ('loc_warehouse', 'Main Warehouse', 'warehouse', '123 Industrial Ave', 'Johannesburg', 'South Africa', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_paddock', 'Paddock', 'event_location', NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_garage', 'Garage', 'workshop', NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_storage', 'Storage Room', 'storage', NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_truck_1', 'Transport Truck #1', 'vehicle', NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_truck_2', 'Transport Truck #2', 'vehicle', NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_workshop', 'Workshop', 'workshop', NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_pit_area', 'Pit Area', 'event_location', NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loc_office', 'Team Office', 'office', NULL, 'Johannesburg', 'South Africa', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
