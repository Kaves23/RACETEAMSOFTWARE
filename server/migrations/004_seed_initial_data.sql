-- Migration 004: Seed Initial Data
-- Created: 30 January 2026
-- PlanetScale MySQL 8.0

-- ============================================
-- SEED USERS
-- ============================================

INSERT INTO users (id, username, email, full_name, role, is_active) VALUES
('admin-001', 'admin', 'admin@raceteam.com', 'System Administrator', 'admin', TRUE),
('user-001', 'john.smith', 'john.smith@raceteam.com', 'John Smith', 'manager', TRUE),
('user-002', 'sarah.jones', 'sarah.jones@raceteam.com', 'Sarah Jones', 'logistics', TRUE),
('user-003', 'mike.wilson', 'mike.wilson@raceteam.com', 'Mike Wilson', 'driver', TRUE);

-- ============================================
-- SEED LOCATIONS
-- ============================================

INSERT INTO locations (id, name, location_type, address, city, country, gps_latitude, gps_longitude, is_active) VALUES
('loc-001', 'Main Warehouse', 'warehouse', '123 Tech Park Drive', 'Milton Keynes', 'UK', 52.0406, -0.7594, TRUE),
('loc-002', 'Silverstone Circuit', 'track', 'Silverstone Circuit', 'Silverstone', 'UK', 52.0786, -1.0169, TRUE),
('loc-003', 'Monaco Circuit', 'track', 'Circuit de Monaco', 'Monte Carlo', 'Monaco', 43.7347, 7.4206, TRUE),
('loc-004', 'Spa-Francorchamps', 'track', 'Circuit de Spa-Francorchamps', 'Stavelot', 'Belgium', 50.4372, 5.9714, TRUE),
('loc-005', 'Monza Circuit', 'track', 'Autodromo Nazionale di Monza', 'Monza', 'Italy', 45.6156, 9.2811, TRUE),
('loc-006', 'Paddock Storage', 'paddock', 'Paddock Area', 'Various', 'Various', NULL, NULL, TRUE),
('loc-007', 'Transport Hub', 'warehouse', '45 Logistics Center', 'Dover', 'UK', 51.1279, 1.3134, TRUE);

-- ============================================
-- SEED EVENTS
-- ============================================

INSERT INTO events (id, name, circuit, country, start_date, end_date, event_type, status) VALUES
('evt-001', 'British Grand Prix 2026', 'Silverstone', 'UK', '2026-07-03', '2026-07-05', 'race', 'scheduled'),
('evt-002', 'Monaco Grand Prix 2026', 'Monaco', 'Monaco', '2026-05-21', '2026-05-24', 'race', 'scheduled'),
('evt-003', 'Belgian Grand Prix 2026', 'Spa-Francorchamps', 'Belgium', '2026-08-28', '2026-08-30', 'race', 'scheduled'),
('evt-004', 'Italian Grand Prix 2026', 'Monza', 'Italy', '2026-09-04', '2026-09-06', 'race', 'scheduled'),
('evt-005', 'Pre-Season Testing', 'Silverstone', 'UK', '2026-02-15', '2026-02-17', 'testing', 'completed');

-- ============================================
-- SEED TRUCKS
-- ============================================

INSERT INTO trucks (id, registration, name, truck_type, dimensions_length_m, dimensions_width_m, dimensions_height_m, max_weight_kg, current_location_id, status) VALUES
('truck-001', 'RTS-001', 'Transport Alpha', 'articulated', 13.6, 2.55, 2.7, 24000, 'loc-001', 'available'),
('truck-002', 'RTS-002', 'Transport Beta', 'articulated', 13.6, 2.55, 2.7, 24000, 'loc-001', 'available'),
('truck-003', 'RTS-003', 'Transport Gamma', 'rigid', 7.5, 2.5, 3.0, 12000, 'loc-001', 'available');

-- ============================================
-- SEED TRUCK ZONES
-- ============================================

INSERT INTO truck_zones (truck_id, zone_name, max_weight_kg, max_volume_m3, position_x, position_y, position_z) VALUES
-- Truck 001 zones
('truck-001', 'Front-Left', 3000, 8.0, 0, 0, 0),
('truck-001', 'Front-Center', 3000, 8.0, 1.5, 0, 0),
('truck-001', 'Front-Right', 3000, 8.0, 3.0, 0, 0),
('truck-001', 'Mid-Left', 3500, 10.0, 0, 4.0, 0),
('truck-001', 'Mid-Center', 3500, 10.0, 1.5, 4.0, 0),
('truck-001', 'Mid-Right', 3500, 10.0, 3.0, 4.0, 0),
('truck-001', 'Rear-Left', 4000, 12.0, 0, 9.0, 0),
('truck-001', 'Rear-Center', 4000, 12.0, 1.5, 9.0, 0),
('truck-001', 'Rear-Right', 4000, 12.0, 3.0, 9.0, 0),

-- Truck 002 zones
('truck-002', 'Front-Left', 3000, 8.0, 0, 0, 0),
('truck-002', 'Front-Center', 3000, 8.0, 1.5, 0, 0),
('truck-002', 'Front-Right', 3000, 8.0, 3.0, 0, 0),
('truck-002', 'Mid-Left', 3500, 10.0, 0, 4.0, 0),
('truck-002', 'Mid-Center', 3500, 10.0, 1.5, 4.0, 0),
('truck-002', 'Mid-Right', 3500, 10.0, 3.0, 4.0, 0),
('truck-002', 'Rear-Left', 4000, 12.0, 0, 9.0, 0),
('truck-002', 'Rear-Center', 4000, 12.0, 1.5, 9.0, 0),
('truck-002', 'Rear-Right', 4000, 12.0, 3.0, 9.0, 0),

-- Truck 003 zones (smaller rigid truck)
('truck-003', 'Front', 4000, 12.0, 0, 0, 0),
('truck-003', 'Mid', 5000, 15.0, 0, 3.0, 0),
('truck-003', 'Rear', 3000, 10.0, 0, 6.0, 0);

-- ============================================
-- SEED BOXES (20 boxes matching demo data)
-- ============================================

INSERT INTO boxes (id, barcode, name, dimensions_length_cm, dimensions_width_cm, dimensions_height_cm, max_weight_kg, current_location_id, status) VALUES
('box-001', 'BOX-001', 'Equipment Box 001', 100, 60, 50, 35, 'loc-001', 'available'),
('box-002', 'BOX-002', 'Equipment Box 002', 100, 60, 50, 35, 'loc-001', 'available'),
('box-003', 'BOX-003', 'Equipment Box 003', 100, 60, 50, 35, 'loc-001', 'available'),
('box-004', 'BOX-004', 'Equipment Box 004', 100, 60, 50, 35, 'loc-001', 'available'),
('box-005', 'BOX-005', 'Equipment Box 005', 100, 60, 50, 35, 'loc-001', 'available'),
('box-006', 'BOX-006', 'Equipment Box 006', 100, 60, 50, 35, 'loc-001', 'available'),
('box-007', 'BOX-007', 'Equipment Box 007', 100, 60, 50, 35, 'loc-001', 'available'),
('box-008', 'BOX-008', 'Equipment Box 008', 100, 60, 50, 35, 'loc-001', 'available'),
('box-009', 'BOX-009', 'Equipment Box 009', 100, 60, 50, 35, 'loc-001', 'available'),
('box-010', 'BOX-010', 'Equipment Box 010', 100, 60, 50, 35, 'loc-001', 'available'),
('box-011', 'BOX-011', 'Equipment Box 011', 100, 60, 50, 35, 'loc-001', 'available'),
('box-012', 'BOX-012', 'Equipment Box 012', 100, 60, 50, 35, 'loc-001', 'available'),
('box-013', 'BOX-013', 'Equipment Box 013', 100, 60, 50, 35, 'loc-001', 'available'),
('box-014', 'BOX-014', 'Equipment Box 014', 100, 60, 50, 35, 'loc-001', 'available'),
('box-015', 'BOX-015', 'Equipment Box 015', 100, 60, 50, 35, 'loc-001', 'available'),
('box-016', 'BOX-016', 'Equipment Box 016', 100, 60, 50, 35, 'loc-001', 'available'),
('box-017', 'BOX-017', 'Equipment Box 017', 100, 60, 50, 35, 'loc-001', 'available'),
('box-018', 'BOX-018', 'Equipment Box 018', 100, 60, 50, 35, 'loc-001', 'available'),
('box-019', 'BOX-019', 'Equipment Box 019', 100, 60, 50, 35, 'loc-001', 'available'),
('box-020', 'BOX-020', 'Equipment Box 020', 100, 60, 50, 35, 'loc-001', 'available');

-- ============================================
-- SEED EQUIPMENT ITEMS (45 items)
-- ============================================

INSERT INTO items (id, barcode, name, item_type, category, current_location_id, weight_kg, value_usd, status) VALUES
-- Tools (15 items)
('eq-001', 'EQ-001', 'Torque Wrench 50Nm', 'equipment', 'Tools', 'loc-001', 2.5, 450, 'available'),
('eq-002', 'EQ-002', 'Torque Wrench 100Nm', 'equipment', 'Tools', 'loc-001', 3.2, 550, 'available'),
('eq-003', 'EQ-003', 'Socket Set Professional', 'equipment', 'Tools', 'loc-001', 8.5, 850, 'available'),
('eq-004', 'EQ-004', 'Impact Gun Cordless', 'equipment', 'Tools', 'loc-001', 4.2, 1200, 'available'),
('eq-005', 'EQ-005', 'Wheel Gun Pneumatic', 'equipment', 'Tools', 'loc-001', 6.8, 2500, 'available'),
('eq-006', 'EQ-006', 'Allen Key Set Metric', 'equipment', 'Tools', 'loc-001', 1.5, 120, 'available'),
('eq-007', 'EQ-007', 'Precision Screwdriver Set', 'equipment', 'Tools', 'loc-001', 0.8, 180, 'available'),
('eq-008', 'EQ-008', 'Pliers Set Professional', 'equipment', 'Tools', 'loc-001', 2.1, 250, 'available'),
('eq-009', 'EQ-009', 'Wire Cutters Heavy Duty', 'equipment', 'Tools', 'loc-001', 1.2, 85, 'available'),
('eq-010', 'EQ-010', 'Adjustable Wrench 300mm', 'equipment', 'Tools', 'loc-001', 1.8, 95, 'available'),
('eq-011', 'EQ-011', 'Hammer Ball Peen', 'equipment', 'Tools', 'loc-001', 1.5, 45, 'available'),
('eq-012', 'EQ-012', 'Mallet Rubber', 'equipment', 'Tools', 'loc-001', 0.9, 35, 'available'),
('eq-013', 'EQ-013', 'Measuring Tape 10m', 'equipment', 'Tools', 'loc-001', 0.5, 25, 'available'),
('eq-014', 'EQ-014', 'Digital Caliper 300mm', 'equipment', 'Tools', 'loc-001', 0.6, 150, 'available'),
('eq-015', 'EQ-015', 'Torque Angle Gauge', 'equipment', 'Tools', 'loc-001', 0.4, 320, 'available'),

-- Diagnostics (10 items)
('eq-016', 'EQ-016', 'OBD Scanner Professional', 'equipment', 'Diagnostics', 'loc-001', 1.2, 3500, 'available'),
('eq-017', 'EQ-017', 'Pressure Gauge Oil', 'equipment', 'Diagnostics', 'loc-001', 0.8, 280, 'available'),
('eq-018', 'EQ-018', 'Pressure Gauge Fuel', 'equipment', 'Diagnostics', 'loc-001', 0.8, 280, 'available'),
('eq-019', 'EQ-019', 'Temperature Probe Digital', 'equipment', 'Diagnostics', 'loc-001', 0.3, 420, 'available'),
('eq-020', 'EQ-020', 'Multimeter Fluke 87V', 'equipment', 'Diagnostics', 'loc-001', 0.6, 450, 'available'),
('eq-021', 'EQ-021', 'Oscilloscope Portable', 'equipment', 'Diagnostics', 'loc-001', 2.5, 2800, 'available'),
('eq-022', 'EQ-022', 'Compression Tester Kit', 'equipment', 'Diagnostics', 'loc-001', 3.2, 650, 'available'),
('eq-023', 'EQ-023', 'Leak Detector Ultrasonic', 'equipment', 'Diagnostics', 'loc-001', 1.5, 1200, 'available'),
('eq-024', 'EQ-024', 'Data Logger 8-Channel', 'equipment', 'Diagnostics', 'loc-001', 0.9, 3200, 'available'),
('eq-025', 'EQ-025', 'Thermal Camera Handheld', 'equipment', 'Diagnostics', 'loc-001', 1.8, 4500, 'available'),

-- Lifting (10 items)
('eq-026', 'EQ-026', 'Hydraulic Jack 3 Ton', 'equipment', 'Lifting', 'loc-001', 15.5, 850, 'available'),
('eq-027', 'EQ-027', 'Hydraulic Jack 5 Ton', 'equipment', 'Lifting', 'loc-001', 22.0, 1200, 'available'),
('eq-028', 'EQ-028', 'Jack Stands Pair 3 Ton', 'equipment', 'Lifting', 'loc-001', 12.0, 180, 'available'),
('eq-029', 'EQ-029', 'Jack Stands Pair 5 Ton', 'equipment', 'Lifting', 'loc-001', 18.0, 280, 'available'),
('eq-030', 'EQ-030', 'Wheel Dolly Set', 'equipment', 'Lifting', 'loc-001', 8.5, 320, 'available'),
('eq-031', 'EQ-031', 'Engine Hoist 2 Ton', 'equipment', 'Lifting', 'loc-001', 45.0, 1800, 'available'),
('eq-032', 'EQ-032', 'Transmission Jack', 'equipment', 'Lifting', 'loc-001', 28.0, 950, 'available'),
('eq-033', 'EQ-033', 'Axle Stands Adjustable', 'equipment', 'Lifting', 'loc-001', 14.0, 220, 'available'),
('eq-034', 'EQ-034', 'Lifting Straps 5m', 'equipment', 'Lifting', 'loc-001', 3.5, 95, 'available'),
('eq-035', 'EQ-035', 'Chain Block 2 Ton', 'equipment', 'Lifting', 'loc-001', 12.5, 450, 'available'),

-- Equipment (10 items)
('eq-036', 'EQ-036', 'Air Compressor Portable', 'equipment', 'Equipment', 'loc-001', 25.0, 1500, 'available'),
('eq-037', 'EQ-037', 'Generator 3kW', 'equipment', 'Equipment', 'loc-001', 38.0, 2200, 'available'),
('eq-038', 'EQ-038', 'Pressure Washer', 'equipment', 'Equipment', 'loc-001', 18.5, 850, 'available'),
('eq-039', 'EQ-039', 'Parts Washer Cabinet', 'equipment', 'Equipment', 'loc-001', 55.0, 1200, 'available'),
('eq-040', 'EQ-040', 'Tool Chest Mobile', 'equipment', 'Equipment', 'loc-001', 42.0, 3500, 'available'),
('eq-041', 'EQ-041', 'Welding Set MIG', 'equipment', 'Equipment', 'loc-001', 32.0, 2800, 'available'),
('eq-042', 'EQ-042', 'Battery Charger 12V', 'equipment', 'Equipment', 'loc-001', 8.5, 450, 'available'),
('eq-043', 'EQ-043', 'Grinder Angle 230mm', 'equipment', 'Equipment', 'loc-001', 5.2, 280, 'available'),
('eq-044', 'EQ-044', 'Drill Press Bench', 'equipment', 'Equipment', 'loc-001', 65.0, 1800, 'available'),
('eq-045', 'EQ-045', 'Vacuum Wet/Dry Industrial', 'equipment', 'Equipment', 'loc-001', 28.0, 650, 'available');

-- ============================================
-- SEED ASSET ITEMS (40 items)
-- ============================================

INSERT INTO items (id, barcode, name, item_type, category, current_location_id, weight_kg, value_usd, status) VALUES
-- Brakes (10 items)
('as-001', 'AS-001', 'Front Brake Disc Left', 'asset', 'Brakes', 'loc-001', 1.8, 2500, 'available'),
('as-002', 'AS-002', 'Front Brake Disc Right', 'asset', 'Brakes', 'loc-001', 1.8, 2500, 'available'),
('as-003', 'AS-003', 'Rear Brake Disc Left', 'asset', 'Brakes', 'loc-001', 1.5, 2200, 'available'),
('as-004', 'AS-004', 'Rear Brake Disc Right', 'asset', 'Brakes', 'loc-001', 1.5, 2200, 'available'),
('as-005', 'AS-005', 'Brake Pad Set Front', 'asset', 'Brakes', 'loc-001', 0.8, 1200, 'available'),
('as-006', 'AS-006', 'Brake Pad Set Rear', 'asset', 'Brakes', 'loc-001', 0.6, 1000, 'available'),
('as-007', 'AS-007', 'Brake Caliper Front Left', 'asset', 'Brakes', 'loc-001', 2.2, 4500, 'available'),
('as-008', 'AS-008', 'Brake Caliper Front Right', 'asset', 'Brakes', 'loc-001', 2.2, 4500, 'available'),
('as-009', 'AS-009', 'Brake Caliper Rear Left', 'asset', 'Brakes', 'loc-001', 1.9, 3800, 'available'),
('as-010', 'AS-010', 'Brake Caliper Rear Right', 'asset', 'Brakes', 'loc-001', 1.9, 3800, 'available'),

-- Engine (10 items)
('as-011', 'AS-011', 'Turbocharger Assembly', 'asset', 'Engine', 'loc-001', 12.5, 45000, 'available'),
('as-012', 'AS-012', 'Intercooler Core', 'asset', 'Engine', 'loc-001', 8.2, 8500, 'available'),
('as-013', 'AS-013', 'Exhaust Manifold', 'asset', 'Engine', 'loc-001', 6.5, 12000, 'available'),
('as-014', 'AS-014', 'Fuel Injector Set', 'asset', 'Engine', 'loc-001', 1.2, 15000, 'available'),
('as-015', 'AS-015', 'Spark Plug Set', 'asset', 'Engine', 'loc-001', 0.3, 450, 'available'),
('as-016', 'AS-016', 'Ignition Coil Pack', 'asset', 'Engine', 'loc-001', 0.8, 2800, 'available'),
('as-017', 'AS-017', 'Throttle Body Assembly', 'asset', 'Engine', 'loc-001', 2.5, 5500, 'available'),
('as-018', 'AS-018', 'Fuel Pump High Pressure', 'asset', 'Engine', 'loc-001', 3.2, 6200, 'available'),
('as-019', 'AS-019', 'Oil Pump Assembly', 'asset', 'Engine', 'loc-001', 4.5, 3800, 'available'),
('as-020', 'AS-020', 'Water Pump Assembly', 'asset', 'Engine', 'loc-001', 3.8, 2400, 'available'),

-- Filters (10 items)
('as-021', 'AS-021', 'Air Filter Racing', 'asset', 'Filters', 'loc-001', 0.5, 850, 'available'),
('as-022', 'AS-022', 'Oil Filter Performance', 'asset', 'Filters', 'loc-001', 0.4, 120, 'available'),
('as-023', 'AS-023', 'Fuel Filter Primary', 'asset', 'Filters', 'loc-001', 0.3, 180, 'available'),
('as-024', 'AS-024', 'Fuel Filter Secondary', 'asset', 'Filters', 'loc-001', 0.3, 180, 'available'),
('as-025', 'AS-025', 'Cabin Air Filter', 'asset', 'Filters', 'loc-001', 0.2, 85, 'available'),
('as-026', 'AS-026', 'Hydraulic Filter', 'asset', 'Filters', 'loc-001', 0.6, 220, 'available'),
('as-027', 'AS-027', 'Transmission Filter', 'asset', 'Filters', 'loc-001', 0.5, 280, 'available'),
('as-028', 'AS-028', 'Coolant Filter', 'asset', 'Filters', 'loc-001', 0.4, 150, 'available'),
('as-029', 'AS-029', 'Breather Filter', 'asset', 'Filters', 'loc-001', 0.2, 95, 'available'),
('as-030', 'AS-030', 'Diff Oil Filter', 'asset', 'Filters', 'loc-001', 0.3, 120, 'available'),

-- Cooling (10 items)
('as-031', 'AS-031', 'Radiator Core Assembly', 'asset', 'Cooling', 'loc-001', 8.5, 5500, 'available'),
('as-032', 'AS-032', 'Cooling Fan Electric', 'asset', 'Cooling', 'loc-001', 2.8, 1200, 'available'),
('as-033', 'AS-033', 'Thermostat Housing', 'asset', 'Cooling', 'loc-001', 0.8, 450, 'available'),
('as-034', 'AS-034', 'Coolant Hose Kit', 'asset', 'Cooling', 'loc-001', 1.5, 680, 'available'),
('as-035', 'AS-035', 'Expansion Tank', 'asset', 'Cooling', 'loc-001', 0.6, 320, 'available'),
('as-036', 'AS-036', 'Oil Cooler Assembly', 'asset', 'Cooling', 'loc-001', 4.2, 3200, 'available'),
('as-037', 'AS-037', 'Transmission Cooler', 'asset', 'Cooling', 'loc-001', 3.8, 2800, 'available'),
('as-038', 'AS-038', 'Heat Exchanger', 'asset', 'Cooling', 'loc-001', 6.5, 4500, 'available'),
('as-039', 'AS-039', 'Coolant Reservoir', 'asset', 'Cooling', 'loc-001', 0.5, 180, 'available'),
('as-040', 'AS-040', 'Temperature Sensor Set', 'asset', 'Cooling', 'loc-001', 0.2, 420, 'available');

-- ============================================
-- SEED BARCODES (auto-generate for all entities)
-- ============================================

INSERT INTO barcodes (id, barcode, barcode_type, entity_id, format, is_active) VALUES
-- Box barcodes
('bc-box-001', 'BOX-001', 'box', 'box-001', 'CODE128', TRUE),
('bc-box-002', 'BOX-002', 'box', 'box-002', 'CODE128', TRUE),
('bc-box-003', 'BOX-003', 'box', 'box-003', 'CODE128', TRUE),
('bc-box-004', 'BOX-004', 'box', 'box-004', 'CODE128', TRUE),
('bc-box-005', 'BOX-005', 'box', 'box-005', 'CODE128', TRUE),
('bc-box-006', 'BOX-006', 'box', 'box-006', 'CODE128', TRUE),
('bc-box-007', 'BOX-007', 'box', 'box-007', 'CODE128', TRUE),
('bc-box-008', 'BOX-008', 'box', 'box-008', 'CODE128', TRUE),
('bc-box-009', 'BOX-009', 'box', 'box-009', 'CODE128', TRUE),
('bc-box-010', 'BOX-010', 'box', 'box-010', 'CODE128', TRUE),
('bc-box-011', 'BOX-011', 'box', 'box-011', 'CODE128', TRUE),
('bc-box-012', 'BOX-012', 'box', 'box-012', 'CODE128', TRUE),
('bc-box-013', 'BOX-013', 'box', 'box-013', 'CODE128', TRUE),
('bc-box-014', 'BOX-014', 'box', 'box-014', 'CODE128', TRUE),
('bc-box-015', 'BOX-015', 'box', 'box-015', 'CODE128', TRUE),
('bc-box-016', 'BOX-016', 'box', 'box-016', 'CODE128', TRUE),
('bc-box-017', 'BOX-017', 'box', 'box-017', 'CODE128', TRUE),
('bc-box-018', 'BOX-018', 'box', 'box-018', 'CODE128', TRUE),
('bc-box-019', 'BOX-019', 'box', 'box-019', 'CODE128', TRUE),
('bc-box-020', 'BOX-020', 'box', 'box-020', 'CODE128', TRUE),

-- Equipment item barcodes (45 items - showing first 10, pattern continues)
('bc-eq-001', 'EQ-001', 'item', 'eq-001', 'CODE128', TRUE),
('bc-eq-002', 'EQ-002', 'item', 'eq-002', 'CODE128', TRUE),
('bc-eq-003', 'EQ-003', 'item', 'eq-003', 'CODE128', TRUE),
('bc-eq-004', 'EQ-004', 'item', 'eq-004', 'CODE128', TRUE),
('bc-eq-005', 'EQ-005', 'item', 'eq-005', 'CODE128', TRUE),
('bc-eq-006', 'EQ-006', 'item', 'eq-006', 'CODE128', TRUE),
('bc-eq-007', 'EQ-007', 'item', 'eq-007', 'CODE128', TRUE),
('bc-eq-008', 'EQ-008', 'item', 'eq-008', 'CODE128', TRUE),
('bc-eq-009', 'EQ-009', 'item', 'eq-009', 'CODE128', TRUE),
('bc-eq-010', 'EQ-010', 'item', 'eq-010', 'CODE128', TRUE),
('bc-eq-011', 'EQ-011', 'item', 'eq-011', 'CODE128', TRUE),
('bc-eq-012', 'EQ-012', 'item', 'eq-012', 'CODE128', TRUE),
('bc-eq-013', 'EQ-013', 'item', 'eq-013', 'CODE128', TRUE),
('bc-eq-014', 'EQ-014', 'item', 'eq-014', 'CODE128', TRUE),
('bc-eq-015', 'EQ-015', 'item', 'eq-015', 'CODE128', TRUE),
('bc-eq-016', 'EQ-016', 'item', 'eq-016', 'CODE128', TRUE),
('bc-eq-017', 'EQ-017', 'item', 'eq-017', 'CODE128', TRUE),
('bc-eq-018', 'EQ-018', 'item', 'eq-018', 'CODE128', TRUE),
('bc-eq-019', 'EQ-019', 'item', 'eq-019', 'CODE128', TRUE),
('bc-eq-020', 'EQ-020', 'item', 'eq-020', 'CODE128', TRUE),
('bc-eq-021', 'EQ-021', 'item', 'eq-021', 'CODE128', TRUE),
('bc-eq-022', 'EQ-022', 'item', 'eq-022', 'CODE128', TRUE),
('bc-eq-023', 'EQ-023', 'item', 'eq-023', 'CODE128', TRUE),
('bc-eq-024', 'EQ-024', 'item', 'eq-024', 'CODE128', TRUE),
('bc-eq-025', 'EQ-025', 'item', 'eq-025', 'CODE128', TRUE),
('bc-eq-026', 'EQ-026', 'item', 'eq-026', 'CODE128', TRUE),
('bc-eq-027', 'EQ-027', 'item', 'eq-027', 'CODE128', TRUE),
('bc-eq-028', 'EQ-028', 'item', 'eq-028', 'CODE128', TRUE),
('bc-eq-029', 'EQ-029', 'item', 'eq-029', 'CODE128', TRUE),
('bc-eq-030', 'EQ-030', 'item', 'eq-030', 'CODE128', TRUE),
('bc-eq-031', 'EQ-031', 'item', 'eq-031', 'CODE128', TRUE),
('bc-eq-032', 'EQ-032', 'item', 'eq-032', 'CODE128', TRUE),
('bc-eq-033', 'EQ-033', 'item', 'eq-033', 'CODE128', TRUE),
('bc-eq-034', 'EQ-034', 'item', 'eq-034', 'CODE128', TRUE),
('bc-eq-035', 'EQ-035', 'item', 'eq-035', 'CODE128', TRUE),
('bc-eq-036', 'EQ-036', 'item', 'eq-036', 'CODE128', TRUE),
('bc-eq-037', 'EQ-037', 'item', 'eq-037', 'CODE128', TRUE),
('bc-eq-038', 'EQ-038', 'item', 'eq-038', 'CODE128', TRUE),
('bc-eq-039', 'EQ-039', 'item', 'eq-039', 'CODE128', TRUE),
('bc-eq-040', 'EQ-040', 'item', 'eq-040', 'CODE128', TRUE),
('bc-eq-041', 'EQ-041', 'item', 'eq-041', 'CODE128', TRUE),
('bc-eq-042', 'EQ-042', 'item', 'eq-042', 'CODE128', TRUE),
('bc-eq-043', 'EQ-043', 'item', 'eq-043', 'CODE128', TRUE),
('bc-eq-044', 'EQ-044', 'item', 'eq-044', 'CODE128', TRUE),
('bc-eq-045', 'EQ-045', 'item', 'eq-045', 'CODE128', TRUE),

-- Asset item barcodes (40 items)
('bc-as-001', 'AS-001', 'item', 'as-001', 'CODE128', TRUE),
('bc-as-002', 'AS-002', 'item', 'as-002', 'CODE128', TRUE),
('bc-as-003', 'AS-003', 'item', 'as-003', 'CODE128', TRUE),
('bc-as-004', 'AS-004', 'item', 'as-004', 'CODE128', TRUE),
('bc-as-005', 'AS-005', 'item', 'as-005', 'CODE128', TRUE),
('bc-as-006', 'AS-006', 'item', 'as-006', 'CODE128', TRUE),
('bc-as-007', 'AS-007', 'item', 'as-007', 'CODE128', TRUE),
('bc-as-008', 'AS-008', 'item', 'as-008', 'CODE128', TRUE),
('bc-as-009', 'AS-009', 'item', 'as-009', 'CODE128', TRUE),
('bc-as-010', 'AS-010', 'item', 'as-010', 'CODE128', TRUE),
('bc-as-011', 'AS-011', 'item', 'as-011', 'CODE128', TRUE),
('bc-as-012', 'AS-012', 'item', 'as-012', 'CODE128', TRUE),
('bc-as-013', 'AS-013', 'item', 'as-013', 'CODE128', TRUE),
('bc-as-014', 'AS-014', 'item', 'as-014', 'CODE128', TRUE),
('bc-as-015', 'AS-015', 'item', 'as-015', 'CODE128', TRUE),
('bc-as-016', 'AS-016', 'item', 'as-016', 'CODE128', TRUE),
('bc-as-017', 'AS-017', 'item', 'as-017', 'CODE128', TRUE),
('bc-as-018', 'AS-018', 'item', 'as-018', 'CODE128', TRUE),
('bc-as-019', 'AS-019', 'item', 'as-019', 'CODE128', TRUE),
('bc-as-020', 'AS-020', 'item', 'as-020', 'CODE128', TRUE),
('bc-as-021', 'AS-021', 'item', 'as-021', 'CODE128', TRUE),
('bc-as-022', 'AS-022', 'item', 'as-022', 'CODE128', TRUE),
('bc-as-023', 'AS-023', 'item', 'as-023', 'CODE128', TRUE),
('bc-as-024', 'AS-024', 'item', 'as-024', 'CODE128', TRUE),
('bc-as-025', 'AS-025', 'item', 'as-025', 'CODE128', TRUE),
('bc-as-026', 'AS-026', 'item', 'as-026', 'CODE128', TRUE),
('bc-as-027', 'AS-027', 'item', 'as-027', 'CODE128', TRUE),
('bc-as-028', 'AS-028', 'item', 'as-028', 'CODE128', TRUE),
('bc-as-029', 'AS-029', 'item', 'as-029', 'CODE128', TRUE),
('bc-as-030', 'AS-030', 'item', 'as-030', 'CODE128', TRUE),
('bc-as-031', 'AS-031', 'item', 'as-031', 'CODE128', TRUE),
('bc-as-032', 'AS-032', 'item', 'as-032', 'CODE128', TRUE),
('bc-as-033', 'AS-033', 'item', 'as-033', 'CODE128', TRUE),
('bc-as-034', 'AS-034', 'item', 'as-034', 'CODE128', TRUE),
('bc-as-035', 'AS-035', 'item', 'as-035', 'CODE128', TRUE),
('bc-as-036', 'AS-036', 'item', 'as-036', 'CODE128', TRUE),
('bc-as-037', 'AS-037', 'item', 'as-037', 'CODE128', TRUE),
('bc-as-038', 'AS-038', 'item', 'as-038', 'CODE128', TRUE),
('bc-as-039', 'AS-039', 'item', 'as-039', 'CODE128', TRUE),
('bc-as-040', 'AS-040', 'item', 'as-040', 'CODE128', TRUE),

-- Truck barcodes
('bc-truck-001', 'RTS-001', 'truck', 'truck-001', 'CODE128', TRUE),
('bc-truck-002', 'RTS-002', 'truck', 'truck-002', 'CODE128', TRUE),
('bc-truck-003', 'RTS-003', 'truck', 'truck-003', 'CODE128', TRUE);

-- ============================================
-- Migration complete
-- ============================================
