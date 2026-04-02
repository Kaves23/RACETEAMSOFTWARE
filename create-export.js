// This script creates a localStorage export from the demo data in the HTML files
const fs = require('fs');

// Simulated localStorage data based on your demo-data-manager.html
const boxes = [
  { id: 'BOX-001', barcode: 'BOX-001', name: 'Front Wing Assembly Box', length: 180, width: 80, height: 60, maxWeight: 50, currentWeight: 35, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-002', barcode: 'BOX-002', name: 'Rear Wing Components', length: 160, width: 70, height: 55, maxWeight: 45, currentWeight: 30, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-003', barcode: 'BOX-003', name: 'Suspension Parts A', length: 120, width: 60, height: 50, maxWeight: 60, currentWeight: 48, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-004', barcode: 'BOX-004', name: 'Suspension Parts B', length: 120, width: 60, height: 50, maxWeight: 60, currentWeight: 45, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-005', barcode: 'BOX-005', name: 'Brake System Box', length: 100, width: 60, height: 50, maxWeight: 40, currentWeight: 32, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-006', barcode: 'BOX-006', name: 'Electronics & Sensors', length: 80, width: 50, height: 40, maxWeight: 25, currentWeight: 18, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-007', barcode: 'BOX-007', name: 'Fuel System Parts', length: 90, width: 60, height: 45, maxWeight: 35, currentWeight: 28, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-008', barcode: 'BOX-008', name: 'Engine Spare Parts', length: 110, width: 70, height: 55, maxWeight: 55, currentWeight: 42, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-009', barcode: 'BOX-009', name: 'Gearbox Components', length: 95, width: 65, height: 50, maxWeight: 50, currentWeight: 38, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-010', barcode: 'BOX-010', name: 'Bodywork Panels', length: 200, width: 90, height: 40, maxWeight: 30, currentWeight: 22, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-011', barcode: 'BOX-011', name: 'Tools Box - Main', length: 100, width: 60, height: 50, maxWeight: 45, currentWeight: 35, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-012', barcode: 'BOX-012', name: 'Tools Box - Precision', length: 80, width: 50, height: 40, maxWeight: 30, currentWeight: 22, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-013', barcode: 'BOX-013', name: 'Tyre Warmers', length: 120, width: 80, height: 60, maxWeight: 40, currentWeight: 28, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-014', barcode: 'BOX-014', name: 'Wheel Guns & Air Tools', length: 90, width: 60, height: 45, maxWeight: 35, currentWeight: 25, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-015', barcode: 'BOX-015', name: 'Pit Equipment', length: 110, width: 70, height: 55, maxWeight: 50, currentWeight: 38, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-016', barcode: 'BOX-016', name: 'Safety Equipment', length: 100, width: 60, height: 50, maxWeight: 35, currentWeight: 26, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-017', barcode: 'BOX-017', name: 'Fluids & Chemicals', length: 85, width: 55, height: 45, maxWeight: 40, currentWeight: 32, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-018', barcode: 'BOX-018', name: 'Telemetry Equipment', length: 75, width: 50, height: 40, maxWeight: 25, currentWeight: 18, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-019', barcode: 'BOX-019', name: 'Spares Kit - Emergency', length: 95, width: 60, height: 50, maxWeight: 45, currentWeight: 35, status: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'BOX-020', barcode: 'BOX-020', name: 'Garage Equipment', length: 130, width: 75, height: 60, maxWeight: 60, currentWeight: 48, status: 'warehouse', createdAt: new Date().toISOString() }
];

const equipment = [
  { id: 'EQ-001', barcode: 'EQ-001', name: 'Impact Wrench - Primary', type: 'equipment', category: 'tools', weight: 3.5, status: 'warehouse', boxId: 'BOX-011', createdAt: new Date().toISOString() },
  { id: 'EQ-002', barcode: 'EQ-002', name: 'Impact Wrench - Backup', type: 'equipment', category: 'tools', weight: 3.5, status: 'warehouse', boxId: 'BOX-011', createdAt: new Date().toISOString() },
  { id: 'EQ-003', barcode: 'EQ-003', name: 'Torque Wrench Set', type: 'equipment', category: 'tools', weight: 5.2, status: 'warehouse', boxId: 'BOX-012', createdAt: new Date().toISOString() },
  { id: 'EQ-004', barcode: 'EQ-004', name: 'Wheel Gun - Front', type: 'equipment', category: 'tools', weight: 4.8, status: 'warehouse', boxId: 'BOX-014', createdAt: new Date().toISOString() },
  { id: 'EQ-005', barcode: 'EQ-005', name: 'Wheel Gun - Rear', type: 'equipment', category: 'tools', weight: 4.8, status: 'warehouse', boxId: 'BOX-014', createdAt: new Date().toISOString() },
  { id: 'EQ-006', barcode: 'EQ-006', name: 'Air Compressor', type: 'equipment', category: 'tools', weight: 15.0, status: 'warehouse', boxId: 'BOX-014', createdAt: new Date().toISOString() },
  { id: 'EQ-007', barcode: 'EQ-007', name: 'Tire Pressure Gauge Set', type: 'equipment', category: 'tools', weight: 1.2, status: 'warehouse', boxId: 'BOX-013', createdAt: new Date().toISOString() },
  { id: 'EQ-008', barcode: 'EQ-008', name: 'Tire Warmers - Front', type: 'equipment', category: 'tire-equipment', weight: 8.5, status: 'warehouse', boxId: 'BOX-013', createdAt: new Date().toISOString() },
  { id: 'EQ-009', barcode: 'EQ-009', name: 'Tire Warmers - Rear', type: 'equipment', category: 'tire-equipment', weight: 9.2, status: 'warehouse', boxId: 'BOX-013', createdAt: new Date().toISOString() },
  { id: 'EQ-010', barcode: 'EQ-010', name: 'Laptop - Telemetry', type: 'equipment', category: 'electronics', weight: 2.5, status: 'warehouse', boxId: 'BOX-018', createdAt: new Date().toISOString() },
  { id: 'EQ-011', barcode: 'EQ-011', name: 'Data Logger', type: 'equipment', category: 'electronics', weight: 1.8, status: 'warehouse', boxId: 'BOX-018', createdAt: new Date().toISOString() },
  { id: 'EQ-012', barcode: 'EQ-012', name: 'Radio System - Complete', type: 'equipment', category: 'electronics', weight: 3.2, status: 'warehouse', boxId: 'BOX-018', createdAt: new Date().toISOString() },
  { id: 'EQ-013', barcode: 'EQ-013', name: 'Jack - Hydraulic Front', type: 'equipment', category: 'pit-equipment', weight: 12.5, status: 'warehouse', boxId: 'BOX-015', createdAt: new Date().toISOString() },
  { id: 'EQ-014', barcode: 'EQ-014', name: 'Jack - Hydraulic Rear', type: 'equipment', category: 'pit-equipment', weight: 14.0, status: 'warehouse', boxId: 'BOX-015', createdAt: new Date().toISOString() },
  { id: 'EQ-015', barcode: 'EQ-015', name: 'Fuel Rig - Main', type: 'equipment', category: 'fuel', weight: 18.5, status: 'warehouse', boxId: 'BOX-007', createdAt: new Date().toISOString() },
  { id: 'EQ-016', barcode: 'EQ-016', name: 'Fire Extinguisher Set', type: 'equipment', category: 'safety', weight: 6.5, status: 'warehouse', boxId: 'BOX-016', createdAt: new Date().toISOString() },
  { id: 'EQ-017', barcode: 'EQ-017', name: 'First Aid Kit - Complete', type: 'equipment', category: 'safety', weight: 3.8, status: 'warehouse', boxId: 'BOX-016', createdAt: new Date().toISOString() },
  { id: 'EQ-018', barcode: 'EQ-018', name: 'Spill Kit', type: 'equipment', category: 'safety', weight: 4.2, status: 'warehouse', boxId: 'BOX-016', createdAt: new Date().toISOString() },
  { id: 'EQ-019', barcode: 'EQ-019', name: 'Generator - 5kW', type: 'equipment', category: 'power', weight: 45.0, status: 'warehouse', boxId: 'BOX-020', createdAt: new Date().toISOString() },
  { id: 'EQ-020', barcode: 'EQ-020', name: 'Extension Cable Set', type: 'equipment', category: 'power', weight: 8.5, status: 'warehouse', boxId: 'BOX-020', createdAt: new Date().toISOString() },
  { id: 'EQ-021', barcode: 'EQ-021', name: 'Socket Set - Metric', type: 'equipment', category: 'tools', weight: 4.2, status: 'warehouse', boxId: 'BOX-011', createdAt: new Date().toISOString() },
  { id: 'EQ-022', barcode: 'EQ-022', name: 'Allen Key Set', type: 'equipment', category: 'tools', weight: 1.5, status: 'warehouse', boxId: 'BOX-012', createdAt: new Date().toISOString() },
  { id: 'EQ-023', barcode: 'EQ-023', name: 'Screwdriver Set', type: 'equipment', category: 'tools', weight: 2.8, status: 'warehouse', boxId: 'BOX-012', createdAt: new Date().toISOString() },
  { id: 'EQ-024', barcode: 'EQ-024', name: 'Pliers Set', type: 'equipment', category: 'tools', weight: 2.2, status: 'warehouse', boxId: 'BOX-012', createdAt: new Date().toISOString() },
  { id: 'EQ-025', barcode: 'EQ-025', name: 'Multimeter', type: 'equipment', category: 'electronics', weight: 0.8, status: 'warehouse', boxId: 'BOX-006', createdAt: new Date().toISOString() },
  { id: 'EQ-026', barcode: 'EQ-026', name: 'Cable Tester', type: 'equipment', category: 'electronics', weight: 0.6, status: 'warehouse', boxId: 'BOX-006', createdAt: new Date().toISOString() },
  { id: 'EQ-027', barcode: 'EQ-027', name: 'Soldering Station', type: 'equipment', category: 'electronics', weight: 3.5, status: 'warehouse', boxId: 'BOX-006', createdAt: new Date().toISOString() },
  { id: 'EQ-028', barcode: 'EQ-028', name: 'Brake Bleeding Kit', type: 'equipment', category: 'brake-tools', weight: 2.8, status: 'warehouse', boxId: 'BOX-005', createdAt: new Date().toISOString() },
  { id: 'EQ-029', barcode: 'EQ-029', name: 'Suspension Setup Tools', type: 'equipment', category: 'tools', weight: 6.5, status: 'warehouse', boxId: 'BOX-003', createdAt: new Date().toISOString() },
  { id: 'EQ-030', barcode: 'EQ-030', name: 'Alignment Gauges', type: 'equipment', category: 'tools', weight: 4.2, status: 'warehouse', boxId: 'BOX-003', createdAt: new Date().toISOString() },
  { id: 'EQ-031', barcode: 'EQ-031', name: 'Fuel Pressure Tester', type: 'equipment', category: 'diagnostic', weight: 1.8, status: 'warehouse', boxId: 'BOX-007', createdAt: new Date().toISOString() },
  { id: 'EQ-032', barcode: 'EQ-032', name: 'Oil Pressure Gauge', type: 'equipment', category: 'diagnostic', weight: 1.2, status: 'warehouse', boxId: 'BOX-008', createdAt: new Date().toISOString() },
  { id: 'EQ-033', barcode: 'EQ-033', name: 'Temperature Gun', type: 'equipment', category: 'diagnostic', weight: 0.5, status: 'warehouse', boxId: 'BOX-018', createdAt: new Date().toISOString() },
  { id: 'EQ-034', barcode: 'EQ-034', name: 'Pit Board Set', type: 'equipment', category: 'pit-equipment', weight: 3.5, status: 'warehouse', boxId: 'BOX-015', createdAt: new Date().toISOString() },
  { id: 'EQ-035', barcode: 'EQ-035', name: 'Stopwatch Set', type: 'equipment', category: 'pit-equipment', weight: 0.8, status: 'warehouse', boxId: 'BOX-015', createdAt: new Date().toISOString() },
  { id: 'EQ-036', barcode: 'EQ-036', name: 'Weight Scales - Digital', type: 'equipment', category: 'tools', weight: 12.5, status: 'warehouse', boxId: 'BOX-020', createdAt: new Date().toISOString() },
  { id: 'EQ-037', barcode: 'EQ-037', name: 'Measuring Tape Set', type: 'equipment', category: 'tools', weight: 1.2, status: 'warehouse', boxId: 'BOX-012', createdAt: new Date().toISOString() },
  { id: 'EQ-038', barcode: 'EQ-038', name: 'Level - Digital', type: 'equipment', category: 'tools', weight: 1.8, status: 'warehouse', boxId: 'BOX-012', createdAt: new Date().toISOString() },
  { id: 'EQ-039', barcode: 'EQ-039', name: 'Caliper - Digital', type: 'equipment', category: 'tools', weight: 0.6, status: 'warehouse', boxId: 'BOX-012', createdAt: new Date().toISOString() },
  { id: 'EQ-040', barcode: 'EQ-040', name: 'Micrometer Set', type: 'equipment', category: 'tools', weight: 2.5, status: 'warehouse', boxId: 'BOX-012', createdAt: new Date().toISOString() },
  { id: 'EQ-041', barcode: 'EQ-041', name: 'Drill - Cordless', type: 'equipment', category: 'tools', weight: 3.2, status: 'warehouse', boxId: 'BOX-011', createdAt: new Date().toISOString() },
  { id: 'EQ-042', barcode: 'EQ-042', name: 'Grinder - Angle', type: 'equipment', category: 'tools', weight: 4.5, status: 'warehouse', boxId: 'BOX-011', createdAt: new Date().toISOString() },
  { id: 'EQ-043', barcode: 'EQ-043', name: 'Heat Gun', type: 'equipment', category: 'tools', weight: 1.8, status: 'warehouse', boxId: 'BOX-011', createdAt: new Date().toISOString() },
  { id: 'EQ-044', barcode: 'EQ-044', name: 'Wire Crimping Tool', type: 'equipment', category: 'tools', weight: 0.8, status: 'warehouse', boxId: 'BOX-006', createdAt: new Date().toISOString() },
  { id: 'EQ-045', barcode: 'EQ-045', name: 'Cable Cutters', type: 'equipment', category: 'tools', weight: 0.9, status: 'warehouse', boxId: 'BOX-006', createdAt: new Date().toISOString() }
];

const assets = [
  { id: 'AS-001', barcode: 'AS-001', name: 'Front Wing - Spare #1', type: 'asset', category: 'aerodynamics', weight: 8.5, value: 15000, status: 'warehouse', boxId: 'BOX-001', createdAt: new Date().toISOString() },
  { id: 'AS-002', barcode: 'AS-002', name: 'Front Wing - Spare #2', type: 'asset', category: 'aerodynamics', weight: 8.5, value: 15000, status: 'warehouse', boxId: 'BOX-001', createdAt: new Date().toISOString() },
  { id: 'AS-003', barcode: 'AS-003', name: 'Rear Wing - Main', type: 'asset', category: 'aerodynamics', weight: 12.5, value: 25000, status: 'warehouse', boxId: 'BOX-002', createdAt: new Date().toISOString() },
  { id: 'AS-004', barcode: 'AS-004', name: 'Rear Wing - Spare', type: 'asset', category: 'aerodynamics', weight: 12.5, value: 25000, status: 'warehouse', boxId: 'BOX-002', createdAt: new Date().toISOString() },
  { id: 'AS-005', barcode: 'AS-005', name: 'Front Suspension Assy - Left', type: 'asset', category: 'suspension', weight: 15.5, value: 35000, status: 'warehouse', boxId: 'BOX-003', createdAt: new Date().toISOString() },
  { id: 'AS-006', barcode: 'AS-006', name: 'Front Suspension Assy - Right', type: 'asset', category: 'suspension', weight: 15.5, value: 35000, status: 'warehouse', boxId: 'BOX-003', createdAt: new Date().toISOString() },
  { id: 'AS-007', barcode: 'AS-007', name: 'Rear Suspension Assy - Left', type: 'asset', category: 'suspension', weight: 18.2, value: 38000, status: 'warehouse', boxId: 'BOX-004', createdAt: new Date().toISOString() },
  { id: 'AS-008', barcode: 'AS-008', name: 'Rear Suspension Assy - Right', type: 'asset', category: 'suspension', weight: 18.2, value: 38000, status: 'warehouse', boxId: 'BOX-004', createdAt: new Date().toISOString() },
  { id: 'AS-009', barcode: 'AS-009', name: 'Brake Disc - Front Left', type: 'asset', category: 'brakes', weight: 1.2, value: 2500, status: 'warehouse', boxId: 'BOX-005', createdAt: new Date().toISOString() },
  { id: 'AS-010', barcode: 'AS-010', name: 'Brake Disc - Front Right', type: 'asset', category: 'brakes', weight: 1.2, value: 2500, status: 'warehouse', boxId: 'BOX-005', createdAt: new Date().toISOString() },
  { id: 'AS-011', barcode: 'AS-011', name: 'Brake Disc - Rear Left', type: 'asset', category: 'brakes', weight: 1.0, value: 2200, status: 'warehouse', boxId: 'BOX-005', createdAt: new Date().toISOString() },
  { id: 'AS-012', barcode: 'AS-012', name: 'Brake Disc - Rear Right', type: 'asset', category: 'brakes', weight: 1.0, value: 2200, status: 'warehouse', boxId: 'BOX-005', createdAt: new Date().toISOString() },
  { id: 'AS-013', barcode: 'AS-013', name: 'Brake Caliper Set - Front', type: 'asset', category: 'brakes', weight: 6.5, value: 8000, status: 'warehouse', boxId: 'BOX-005', createdAt: new Date().toISOString() },
  { id: 'AS-014', barcode: 'AS-014', name: 'Brake Caliper Set - Rear', type: 'asset', category: 'brakes', weight: 5.8, value: 7500, status: 'warehouse', boxId: 'BOX-005', createdAt: new Date().toISOString() },
  { id: 'AS-015', barcode: 'AS-015', name: 'ECU - Main', type: 'asset', category: 'electronics', weight: 2.5, value: 45000, status: 'warehouse', boxId: 'BOX-006', createdAt: new Date().toISOString() },
  { id: 'AS-016', barcode: 'AS-016', name: 'ECU - Backup', type: 'asset', category: 'electronics', weight: 2.5, value: 45000, status: 'warehouse', boxId: 'BOX-006', createdAt: new Date().toISOString() },
  { id: 'AS-017', barcode: 'AS-017', name: 'Wiring Loom - Complete', type: 'asset', category: 'electronics', weight: 8.5, value: 12000, status: 'warehouse', boxId: 'BOX-006', createdAt: new Date().toISOString() },
  { id: 'AS-018', barcode: 'AS-018', name: 'Sensor Kit - Complete', type: 'asset', category: 'electronics', weight: 2.2, value: 8500, status: 'warehouse', boxId: 'BOX-006', createdAt: new Date().toISOString() },
  { id: 'AS-019', barcode: 'AS-019', name: 'Fuel Pump - Main', type: 'asset', category: 'fuel-system', weight: 3.5, value: 5500, status: 'warehouse', boxId: 'BOX-007', createdAt: new Date().toISOString() },
  { id: 'AS-020', barcode: 'AS-020', name: 'Fuel Pump - Spare', type: 'asset', category: 'fuel-system', weight: 3.5, value: 5500, status: 'warehouse', boxId: 'BOX-007', createdAt: new Date().toISOString() },
  { id: 'AS-021', barcode: 'AS-021', name: 'Fuel Tank - Bladder', type: 'asset', category: 'fuel-system', weight: 8.5, value: 15000, status: 'warehouse', boxId: 'BOX-007', createdAt: new Date().toISOString() },
  { id: 'AS-022', barcode: 'AS-022', name: 'Injector Set - Complete', type: 'asset', category: 'engine', weight: 2.8, value: 12000, status: 'warehouse', boxId: 'BOX-008', createdAt: new Date().toISOString() },
  { id: 'AS-023', barcode: 'AS-023', name: 'Throttle Body', type: 'asset', category: 'engine', weight: 3.2, value: 8500, status: 'warehouse', boxId: 'BOX-008', createdAt: new Date().toISOString() },
  { id: 'AS-024', barcode: 'AS-024', name: 'Turbo - Spare Unit', type: 'asset', category: 'engine', weight: 12.5, value: 35000, status: 'warehouse', boxId: 'BOX-008', createdAt: new Date().toISOString() },
  { id: 'AS-025', barcode: 'AS-025', name: 'Exhaust System - Complete', type: 'asset', category: 'engine', weight: 18.5, value: 15000, status: 'warehouse', boxId: 'BOX-008', createdAt: new Date().toISOString() },
  { id: 'AS-026', barcode: 'AS-026', name: 'Gearbox - Spare Ratios', type: 'asset', category: 'transmission', weight: 28.5, value: 85000, status: 'warehouse', boxId: 'BOX-009', createdAt: new Date().toISOString() },
  { id: 'AS-027', barcode: 'AS-027', name: 'Clutch Assembly', type: 'asset', category: 'transmission', weight: 6.5, value: 12000, status: 'warehouse', boxId: 'BOX-009', createdAt: new Date().toISOString() },
  { id: 'AS-028', barcode: 'AS-028', name: 'Driveshafts - Pair', type: 'asset', category: 'transmission', weight: 8.2, value: 15000, status: 'warehouse', boxId: 'BOX-009', createdAt: new Date().toISOString() },
  { id: 'AS-029', barcode: 'AS-029', name: 'Floor Panel - Carbon', type: 'asset', category: 'bodywork', weight: 12.5, value: 25000, status: 'warehouse', boxId: 'BOX-010', createdAt: new Date().toISOString() },
  { id: 'AS-030', barcode: 'AS-030', name: 'Sidepods - Left & Right', type: 'asset', category: 'bodywork', weight: 8.5, value: 18000, status: 'warehouse', boxId: 'BOX-010', createdAt: new Date().toISOString() },
  { id: 'AS-031', barcode: 'AS-031', name: 'Engine Cover', type: 'asset', category: 'bodywork', weight: 4.2, value: 12000, status: 'warehouse', boxId: 'BOX-010', createdAt: new Date().toISOString() },
  { id: 'AS-032', barcode: 'AS-032', name: 'Nose Cone - Spare', type: 'asset', category: 'bodywork', weight: 6.5, value: 15000, status: 'warehouse', boxId: 'BOX-010', createdAt: new Date().toISOString() },
  { id: 'AS-033', barcode: 'AS-033', name: 'Steering Wheel', type: 'asset', category: 'cockpit', weight: 1.8, value: 35000, status: 'warehouse', boxId: 'BOX-006', createdAt: new Date().toISOString() },
  { id: 'AS-034', barcode: 'AS-034', name: 'Seat - Carbon Fiber', type: 'asset', category: 'cockpit', weight: 3.5, value: 8500, status: 'warehouse', boxId: 'BOX-010', createdAt: new Date().toISOString() },
  { id: 'AS-035', barcode: 'AS-035', name: 'Pedal Box Assembly', type: 'asset', category: 'cockpit', weight: 4.2, value: 12000, status: 'warehouse', boxId: 'BOX-010', createdAt: new Date().toISOString() },
  { id: 'AS-036', barcode: 'AS-036', name: 'Damper Set - Ohlins', type: 'asset', category: 'suspension', weight: 12.5, value: 45000, status: 'warehouse', boxId: 'BOX-003', createdAt: new Date().toISOString() },
  { id: 'AS-037', barcode: 'AS-037', name: 'Anti-Roll Bar Set', type: 'asset', category: 'suspension', weight: 8.5, value: 8500, status: 'warehouse', boxId: 'BOX-004', createdAt: new Date().toISOString() },
  { id: 'AS-038', barcode: 'AS-038', name: 'Wheel Set - Forged', type: 'asset', category: 'wheels', weight: 32.0, value: 25000, status: 'warehouse', boxId: 'BOX-019', createdAt: new Date().toISOString() },
  { id: 'AS-039', barcode: 'AS-039', name: 'Radiator - Main', type: 'asset', category: 'cooling', weight: 8.5, value: 12000, status: 'warehouse', boxId: 'BOX-008', createdAt: new Date().toISOString() },
  { id: 'AS-040', barcode: 'AS-040', name: 'Oil Cooler', type: 'asset', category: 'cooling', weight: 5.2, value: 6500, status: 'warehouse', boxId: 'BOX-008', createdAt: new Date().toISOString() }
];

// Create box contents relationships
const boxContents = [];
[...equipment, ...assets].forEach(item => {
  if (item.boxId) {
    boxContents.push({
      boxId: item.boxId,
      itemId: item.id,
      packedAt: item.createdAt,
      packedBy: 'admin-001',
      position: null
    });
  }
});

const exportData = {
  boxes,
  equipment,
  assets,
  boxContents
};

fs.writeFileSync('localStorage-export.json', JSON.stringify(exportData, null, 2));
console.log('✅ Created localStorage-export.json');
console.log(`   📦 Boxes: ${boxes.length}`);
console.log(`   🔧 Equipment: ${equipment.length}`);
console.log(`   🏷️  Assets: ${assets.length}`);
console.log(`   📋 Contents: ${boxContents.length}`);
