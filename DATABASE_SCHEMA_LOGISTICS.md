# Race Team Logistics Database Schema - PlanetScale MySQL
## Comprehensive Many-to-Many Relationships & Tracking System

**Date:** 30 January 2026  
**Database:** PlanetScale (MySQL 8.0 compatible)  
**Current Scope:** Logistics Tab (Box Packing, Load Planning, Inventory Management)

---

## Core Entities

### 1. **items** (Master item registry - Equipment & Assets)
Primary table for all physical items that can be tracked, packed, and moved.

```sql
CREATE TABLE items (
  id VARCHAR(36) PRIMARY KEY,
  barcode VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  item_type ENUM('equipment', 'asset') NOT NULL,
  category VARCHAR(100) NOT NULL, -- Tools, Diagnostics, Brakes, Engine, Filters, etc.
  status ENUM('available', 'in_use', 'maintenance', 'retired') DEFAULT 'available',
  current_box_id VARCHAR(36) NULL, -- FK to boxes.id (nullable for unpacked items)
  current_location_id VARCHAR(36) NULL, -- FK to locations.id (current physical location)
  acquisition_date DATE,
  last_maintenance_date DATE NULL,
  next_maintenance_due DATE NULL,
  value_usd DECIMAL(10,2) DEFAULT 0.00,
  weight_kg DECIMAL(8,2) DEFAULT 0.00,
  condition_notes TEXT,
  manufacturer VARCHAR(100),
  model_number VARCHAR(100),
  serial_number VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_barcode (barcode),
  INDEX idx_item_type (item_type),
  INDEX idx_category (category),
  INDEX idx_status (status),
  INDEX idx_current_box (current_box_id),
  INDEX idx_current_location (current_location_id),
  
  FOREIGN KEY (current_box_id) REFERENCES boxes(id) ON DELETE SET NULL,
  FOREIGN KEY (current_location_id) REFERENCES locations(id) ON DELETE SET NULL
);
```

---

### 2. **boxes** (Containers/Cases)
Physical containers that hold items and can be loaded onto trucks.

```sql
CREATE TABLE boxes (
  id VARCHAR(36) PRIMARY KEY,
  barcode VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  box_type VARCHAR(100) DEFAULT 'Standard Container',
  length_cm DECIMAL(8,2) NOT NULL,
  width_cm DECIMAL(8,2) NOT NULL,
  height_cm DECIMAL(8,2) NOT NULL,
  weight_capacity_kg DECIMAL(8,2) NOT NULL,
  current_weight_kg DECIMAL(8,2) DEFAULT 0.00, -- Calculated from contents
  volume_m3 DECIMAL(10,4) GENERATED ALWAYS AS (length_cm * width_cm * height_cm / 1000000) STORED,
  status ENUM('available', 'packed', 'loaded', 'in_transit', 'retired') DEFAULT 'available',
  current_location_id VARCHAR(36) NULL, -- FK to locations.id
  current_truck_id VARCHAR(36) NULL, -- FK to trucks.id (if loaded on truck)
  current_truck_zone VARCHAR(50) NULL, -- front, middle-left, middle-right, rear
  condition VARCHAR(50) DEFAULT 'Good',
  qr_code_url VARCHAR(500), -- Link to generated QR code image
  rfid_tag VARCHAR(100), -- For RFID tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_barcode (barcode),
  INDEX idx_status (status),
  INDEX idx_location (current_location_id),
  INDEX idx_truck (current_truck_id),
  INDEX idx_truck_zone (current_truck_id, current_truck_zone),
  
  FOREIGN KEY (current_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (current_truck_id) REFERENCES trucks(id) ON DELETE SET NULL
);
```

---

### 3. **box_contents** (Many-to-Many: Boxes ↔ Items)
Junction table tracking which items are in which boxes with timestamps.

```sql
CREATE TABLE box_contents (
  id VARCHAR(36) PRIMARY KEY,
  box_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  item_type ENUM('equipment', 'asset') NOT NULL,
  packed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  packed_by_user_id VARCHAR(36) NULL, -- FK to users.id
  position_in_box INT DEFAULT 0, -- Order/layer in box
  notes TEXT,
  
  INDEX idx_box (box_id),
  INDEX idx_item (item_id),
  INDEX idx_box_item (box_id, item_id),
  INDEX idx_packed_at (packed_at),
  
  FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (packed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  
  UNIQUE KEY unique_item_in_box (box_id, item_id)
);
```

---

### 4. **trucks** (Transport vehicles)
Trucks, trailers, vans used to transport boxes.

```sql
CREATE TABLE trucks (
  id VARCHAR(36) PRIMARY KEY,
  registration VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  truck_type ENUM('truck', 'trailer', 'van', 'semi', 'sprinter') NOT NULL,
  make VARCHAR(100),
  model VARCHAR(100),
  year INT,
  length_cm DECIMAL(8,2) NOT NULL,
  width_cm DECIMAL(8,2) NOT NULL,
  height_cm DECIMAL(8,2) NOT NULL,
  max_weight_kg DECIMAL(10,2) NOT NULL,
  volume_m3 DECIMAL(10,4) GENERATED ALWAYS AS (length_cm * width_cm * height_cm / 1000000) STORED,
  current_weight_kg DECIMAL(10,2) DEFAULT 0.00, -- Calculated from loaded boxes
  status ENUM('available', 'loading', 'loaded', 'in_transit', 'unloading', 'maintenance') DEFAULT 'available',
  current_location_id VARCHAR(36) NULL,
  current_event_id VARCHAR(36) NULL, -- FK to events.id
  gps_latitude DECIMAL(10,8),
  gps_longitude DECIMAL(11,8),
  last_service_date DATE,
  next_service_due DATE,
  fuel_type VARCHAR(50),
  license_plate VARCHAR(50),
  insurance_expiry DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_registration (registration),
  INDEX idx_status (status),
  INDEX idx_type (truck_type),
  INDEX idx_location (current_location_id),
  INDEX idx_event (current_event_id),
  
  FOREIGN KEY (current_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (current_event_id) REFERENCES events(id) ON DELETE SET NULL
);
```

---

### 5. **truck_zones** (Defined zones within trucks)
Configurable zones for organizing boxes within trucks (front, middle, rear, etc.)

```sql
CREATE TABLE truck_zones (
  id VARCHAR(36) PRIMARY KEY,
  truck_id VARCHAR(36) NOT NULL,
  zone_name VARCHAR(50) NOT NULL, -- 'front', 'middle-left', 'middle-right', 'rear'
  zone_label VARCHAR(100) NOT NULL, -- '🚛 Front Section (Cab Area)'
  max_weight_kg DECIMAL(10,2) DEFAULT 0,
  max_volume_m3 DECIMAL(10,4) DEFAULT 0,
  current_weight_kg DECIMAL(10,2) DEFAULT 0.00,
  current_volume_m3 DECIMAL(10,4) DEFAULT 0.00,
  display_order INT DEFAULT 0,
  
  INDEX idx_truck (truck_id),
  INDEX idx_zone_name (truck_id, zone_name),
  
  FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE CASCADE,
  
  UNIQUE KEY unique_zone_per_truck (truck_id, zone_name)
);
```

---

### 6. **load_plans** (Many-to-Many: Trucks ↔ Boxes via Events)
Complete load plans linking boxes to trucks for specific events.

```sql
CREATE TABLE load_plans (
  id VARCHAR(36) PRIMARY KEY,
  plan_name VARCHAR(255) NOT NULL,
  event_id VARCHAR(36) NULL, -- FK to events.id
  truck_id VARCHAR(36) NOT NULL,
  status ENUM('draft', 'approved', 'loading', 'loaded', 'in_transit', 'delivered', 'cancelled') DEFAULT 'draft',
  total_boxes INT DEFAULT 0,
  total_weight_kg DECIMAL(10,2) DEFAULT 0.00,
  total_volume_m3 DECIMAL(10,4) DEFAULT 0.00,
  departure_date DATETIME NULL,
  arrival_date DATETIME NULL,
  departure_location_id VARCHAR(36) NULL,
  destination_location_id VARCHAR(36) NULL,
  created_by_user_id VARCHAR(36) NULL,
  approved_by_user_id VARCHAR(36) NULL,
  approved_at TIMESTAMP NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_event (event_id),
  INDEX idx_truck (truck_id),
  INDEX idx_status (status),
  INDEX idx_departure (departure_date),
  INDEX idx_created_by (created_by_user_id),
  
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE CASCADE,
  FOREIGN KEY (departure_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (destination_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

---

### 7. **load_plan_boxes** (Many-to-Many: Load Plans ↔ Boxes)
Junction table tracking which boxes are in which load plans and their positions.

```sql
CREATE TABLE load_plan_boxes (
  id VARCHAR(36) PRIMARY KEY,
  load_plan_id VARCHAR(36) NOT NULL,
  box_id VARCHAR(36) NOT NULL,
  truck_zone VARCHAR(50) NOT NULL, -- front, middle-left, middle-right, rear
  position_x DECIMAL(8,2) DEFAULT 0, -- 3D coordinates
  position_y DECIMAL(8,2) DEFAULT 0,
  position_z DECIMAL(8,2) DEFAULT 0,
  rotation_deg DECIMAL(5,2) DEFAULT 0,
  load_order INT DEFAULT 0, -- Order in which boxes should be loaded
  unload_order INT DEFAULT 0, -- Order in which boxes should be unloaded
  loaded_at TIMESTAMP NULL,
  loaded_by_user_id VARCHAR(36) NULL,
  unloaded_at TIMESTAMP NULL,
  unloaded_by_user_id VARCHAR(36) NULL,
  notes TEXT,
  
  INDEX idx_load_plan (load_plan_id),
  INDEX idx_box (box_id),
  INDEX idx_zone (load_plan_id, truck_zone),
  INDEX idx_load_order (load_plan_id, load_order),
  
  FOREIGN KEY (load_plan_id) REFERENCES load_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE,
  FOREIGN KEY (loaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (unloaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  
  UNIQUE KEY unique_box_per_plan (load_plan_id, box_id)
);
```

---

### 8. **locations** (Physical locations/warehouses)
All physical locations where items, boxes, or trucks can be stored.

```sql
CREATE TABLE locations (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  location_type ENUM('warehouse', 'workshop', 'track', 'paddock', 'garage', 'storage', 'supplier', 'customer', 'other') NOT NULL,
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state_province VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  gps_latitude DECIMAL(10,8),
  gps_longitude DECIMAL(11,8),
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  bay_identifier VARCHAR(50), -- e.g., 'Bay A1', 'Bay B2'
  capacity_boxes INT DEFAULT 0,
  current_boxes INT DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_type (location_type),
  INDEX idx_city (city),
  INDEX idx_bay (bay_identifier),
  INDEX idx_active (is_active)
);
```

---

### 9. **events** (Race events/destinations)
Events that require logistics planning.

```sql
CREATE TABLE events (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) DEFAULT 'Race',
  circuit_name VARCHAR(255),
  location_id VARCHAR(36) NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  setup_date DATE NULL,
  teardown_date DATE NULL,
  status ENUM('scheduled', 'preparing', 'in_progress', 'completed', 'cancelled') DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_dates (start_date, end_date),
  INDEX idx_status (status),
  INDEX idx_location (location_id),
  
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);
```

---

## History & Audit Tables

### 10. **item_history** (Complete audit trail for items)
Tracks every movement and state change of items.

```sql
CREATE TABLE item_history (
  id VARCHAR(36) PRIMARY KEY,
  item_id VARCHAR(36) NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'packed', 'unpacked', 'moved', 'maintenance', 'status_changed', 'created', 'updated'
  details TEXT,
  from_box_id VARCHAR(36) NULL,
  to_box_id VARCHAR(36) NULL,
  from_location_id VARCHAR(36) NULL,
  to_location_id VARCHAR(36) NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  performed_by_user_id VARCHAR(36) NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  INDEX idx_item (item_id),
  INDEX idx_action (action),
  INDEX idx_timestamp (timestamp),
  INDEX idx_user (performed_by_user_id),
  INDEX idx_boxes (from_box_id, to_box_id),
  
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (from_box_id) REFERENCES boxes(id) ON DELETE SET NULL,
  FOREIGN KEY (to_box_id) REFERENCES boxes(id) ON DELETE SET NULL,
  FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

---

### 11. **box_history** (Complete audit trail for boxes)
Tracks every movement and state change of boxes.

```sql
CREATE TABLE box_history (
  id VARCHAR(36) PRIMARY KEY,
  box_id VARCHAR(36) NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'created', 'packed', 'loaded', 'unloaded', 'moved', 'status_changed'
  details TEXT,
  from_location_id VARCHAR(36) NULL,
  to_location_id VARCHAR(36) NULL,
  from_truck_id VARCHAR(36) NULL,
  to_truck_id VARCHAR(36) NULL,
  from_zone VARCHAR(50) NULL,
  to_zone VARCHAR(50) NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  load_plan_id VARCHAR(36) NULL,
  performed_by_user_id VARCHAR(36) NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  INDEX idx_box (box_id),
  INDEX idx_action (action),
  INDEX idx_timestamp (timestamp),
  INDEX idx_user (performed_by_user_id),
  INDEX idx_trucks (from_truck_id, to_truck_id),
  INDEX idx_load_plan (load_plan_id),
  
  FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE,
  FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (from_truck_id) REFERENCES trucks(id) ON DELETE SET NULL,
  FOREIGN KEY (to_truck_id) REFERENCES trucks(id) ON DELETE SET NULL,
  FOREIGN KEY (load_plan_id) REFERENCES load_plans(id) ON DELETE SET NULL,
  FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

---

### 12. **truck_history** (Complete audit trail for trucks)
Tracks truck movements, maintenance, and assignments.

```sql
CREATE TABLE truck_history (
  id VARCHAR(36) PRIMARY KEY,
  truck_id VARCHAR(36) NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'departure', 'arrival', 'service', 'assignment', 'status_changed'
  details TEXT,
  from_location_id VARCHAR(36) NULL,
  to_location_id VARCHAR(36) NULL,
  event_id VARCHAR(36) NULL,
  load_plan_id VARCHAR(36) NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  gps_latitude DECIMAL(10,8),
  gps_longitude DECIMAL(11,8),
  performed_by_user_id VARCHAR(36) NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_truck (truck_id),
  INDEX idx_action (action),
  INDEX idx_timestamp (timestamp),
  INDEX idx_event (event_id),
  INDEX idx_load_plan (load_plan_id),
  
  FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE CASCADE,
  FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (load_plan_id) REFERENCES load_plans(id) ON DELETE SET NULL,
  FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

---

### 13. **users** (System users for audit trails)
Users who perform actions in the system.

```sql
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('admin', 'manager', 'logistics', 'mechanic', 'driver', 'viewer') DEFAULT 'viewer',
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_active (is_active)
);
```

---

## Supporting Tables

### 14. **item_maintenance_schedule** (Maintenance tracking)
Scheduled and completed maintenance for items.

```sql
CREATE TABLE item_maintenance_schedule (
  id VARCHAR(36) PRIMARY KEY,
  item_id VARCHAR(36) NOT NULL,
  maintenance_type VARCHAR(100) NOT NULL, -- 'calibration', 'service', 'inspection', 'repair'
  scheduled_date DATE NOT NULL,
  completed_date DATE NULL,
  completed_by_user_id VARCHAR(36) NULL,
  next_maintenance_date DATE NULL,
  cost_usd DECIMAL(10,2) DEFAULT 0.00,
  notes TEXT,
  status ENUM('scheduled', 'in_progress', 'completed', 'overdue', 'cancelled') DEFAULT 'scheduled',
  
  INDEX idx_item (item_id),
  INDEX idx_scheduled (scheduled_date),
  INDEX idx_status (status),
  
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

---

### 15. **barcodes** (Barcode/QR code registry)
Centralized barcode tracking for items, boxes, trucks.

```sql
CREATE TABLE barcodes (
  id VARCHAR(36) PRIMARY KEY,
  barcode VARCHAR(100) UNIQUE NOT NULL,
  barcode_type ENUM('item', 'box', 'truck', 'location') NOT NULL,
  reference_id VARCHAR(36) NOT NULL, -- ID of the item/box/truck/location
  qr_code_url VARCHAR(500),
  rfid_tag VARCHAR(100),
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_scanned TIMESTAMP NULL,
  scan_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  
  INDEX idx_barcode (barcode),
  INDEX idx_type (barcode_type),
  INDEX idx_reference (reference_id),
  INDEX idx_rfid (rfid_tag)
);
```

---

### 16. **barcode_scans** (Scan history for tracking)
Every barcode scan recorded for audit and tracking.

```sql
CREATE TABLE barcode_scans (
  id VARCHAR(36) PRIMARY KEY,
  barcode_id VARCHAR(36) NOT NULL,
  scanned_by_user_id VARCHAR(36) NULL,
  scan_location_id VARCHAR(36) NULL,
  gps_latitude DECIMAL(10,8),
  gps_longitude DECIMAL(11,8),
  device_info TEXT,
  action_taken VARCHAR(100), -- 'pack', 'unpack', 'load', 'unload', 'verify', 'inspect'
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_barcode (barcode_id),
  INDEX idx_timestamp (timestamp),
  INDEX idx_user (scanned_by_user_id),
  INDEX idx_location (scan_location_id),
  
  FOREIGN KEY (barcode_id) REFERENCES barcodes(id) ON DELETE CASCADE,
  FOREIGN KEY (scanned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (scan_location_id) REFERENCES locations(id) ON DELETE SET NULL
);
```

---

## Key Many-to-Many Relationships Summary

### 🔄 **Primary M:M Relationships:**

1. **Items ↔ Boxes** (via `box_contents`)
   - One item can be in one box at a time (current state)
   - One box can contain many items
   - Historical tracking via `item_history`

2. **Boxes ↔ Trucks** (via `load_plan_boxes`)
   - One box can be on one truck at a time (current state)
   - One truck can carry many boxes
   - Organized into zones within trucks via `truck_zones`

3. **Trucks ↔ Events** (via `load_plans`)
   - One event can have multiple trucks
   - One truck can serve multiple events over time
   - Load plans link trucks to specific events

4. **Load Plans ↔ Boxes** (via `load_plan_boxes`)
   - One load plan includes many boxes
   - One box can appear in multiple load plans over time

5. **Items ↔ Locations** (via `items.current_location_id` + `item_history`)
   - Current location tracked on item
   - Full movement history in `item_history`

6. **Boxes ↔ Locations** (via `boxes.current_location_id` + `box_history`)
   - Current location tracked on box
   - Full movement history in `box_history`

---

## Tracking Capabilities

### ✅ **What This Schema Tracks:**

1. **Item Level:**
   - Current location (warehouse bay)
   - Current box (if packed)
   - Complete movement history
   - Maintenance schedule and history
   - Serial numbers and barcodes
   - Value and condition

2. **Box Level:**
   - Current location (warehouse bay)
   - Current truck and zone (if loaded)
   - Contents (all items inside)
   - Weight and volume utilization
   - Complete movement history
   - QR code and RFID tags

3. **Truck Level:**
   - Current location (GPS coordinates)
   - Current event assignment
   - All loaded boxes and their zones
   - Weight and volume capacity vs. usage
   - Service history
   - Complete trip history

4. **Load Plan Level:**
   - Which boxes go on which truck
   - For which event
   - Departure and arrival times
   - Approval workflow
   - Loading/unloading order
   - 3D positioning data

5. **Location Level:**
   - All items at location
   - All boxes at location
   - All trucks at location
   - Capacity tracking

6. **Audit Trail:**
   - Every item movement
   - Every box movement
   - Every truck movement
   - Who did what, when
   - GPS coordinates of actions
   - Device/IP information

---

## Indexes for Performance

All tables include strategic indexes for:
- Primary lookups (IDs, barcodes)
- Foreign key relationships
- Common query patterns (status, dates, locations)
- Audit trail searches (timestamps, users)
- GPS coordinate searches (spatial queries)

---

## Next Steps for Implementation

1. **Create PlanetScale database** matching this schema
2. **Build REST API** (Node.js/Express or similar)
3. **Create migration scripts** from localStorage to database
4. **Update frontend** to use API calls instead of localStorage
5. **Implement real-time sync** for multi-user scenarios
6. **Add barcode scanning integration** (mobile app)
7. **Build reporting dashboard** using this data structure

---

## Sample Queries

### Get all items in a specific box:
```sql
SELECT i.*, bc.packed_at 
FROM items i
JOIN box_contents bc ON i.id = bc.item_id
WHERE bc.box_id = '[box-id]'
ORDER BY bc.position_in_box;
```

### Get all boxes on a truck for a specific event:
```sql
SELECT b.*, lpb.truck_zone, lp.event_id
FROM boxes b
JOIN load_plan_boxes lpb ON b.id = lpb.box_id
JOIN load_plans lp ON lpb.load_plan_id = lp.id
WHERE lp.event_id = '[event-id]' AND lp.truck_id = '[truck-id]'
ORDER BY lpb.load_order;
```

### Get complete movement history for an item:
```sql
SELECT ih.*, u.full_name as performed_by, 
       from_box.name as from_box_name,
       to_box.name as to_box_name,
       from_loc.name as from_location_name,
       to_loc.name as to_location_name
FROM item_history ih
LEFT JOIN users u ON ih.performed_by_user_id = u.id
LEFT JOIN boxes from_box ON ih.from_box_id = from_box.id
LEFT JOIN boxes to_box ON ih.to_box_id = to_box.id
LEFT JOIN locations from_loc ON ih.from_location_id = from_loc.id
LEFT JOIN locations to_loc ON ih.to_location_id = to_loc.id
WHERE ih.item_id = '[item-id]'
ORDER BY ih.timestamp DESC;
```

### Track box current status with all its contents:
```sql
SELECT 
  b.barcode as box_barcode,
  b.name as box_name,
  b.status,
  l.name as current_location,
  t.name as current_truck,
  b.current_truck_zone,
  COUNT(bc.id) as item_count,
  b.current_weight_kg,
  b.weight_capacity_kg,
  (b.current_weight_kg / b.weight_capacity_kg * 100) as weight_utilization_pct
FROM boxes b
LEFT JOIN locations l ON b.current_location_id = l.id
LEFT JOIN trucks t ON b.current_truck_id = t.id
LEFT JOIN box_contents bc ON b.id = bc.box_id
WHERE b.id = '[box-id]'
GROUP BY b.id;
```

---

**Total Tables:** 16 core tables + additional support tables as needed  
**Total Relationships:** 25+ foreign keys for complete data integrity  
**Storage Estimate:** ~10-50MB for initial data, scalable to terabytes
