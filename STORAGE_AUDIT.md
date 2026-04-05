# Storage Audit: localStorage vs PlanetScale Database
**Date:** April 4, 2026  
**Status:** Active Migration in Progress

---

## ✅ ALREADY MIGRATED TO PLANETSCALE

### 1. **Boxes** (`boxes` table)
- **localStorage Key:** `rts.boxes.v1`
- **Database Table:** ✅ `boxes` (001_create_core_tables.sql)
- **API Endpoints:** ✅ `/api/boxes` (CRUD complete)
- **Status:** **FULLY MIGRATED** - Box packing system uses API
- **Fields:** id, barcode, name, dimensions, weight, location, truck, zone, rfid_tag, status

### 2. **Items (Equipment & Assets)** (`items` table)
- **localStorage Keys:** `rts.equipment.v1`, `rts.assets.v1`
- **Database Table:** ✅ `items` (001_create_core_tables.sql)
- **API Endpoints:** ✅ `/api/items` (CRUD complete)
- **Status:** **FULLY MIGRATED** - Box packing reads from API
- **Fields:** id, barcode, name, item_type, category, description, current_box_id, current_location_id, serial_number, weight_kg, value_usd, status

### 3. **Asset Types** (`asset_types` table)
- **localStorage:** Previously in `rts.settings.v1` → assetTypes array
- **Database Table:** ✅ `asset_types` (007_create_asset_types_table.sql + 008_add_custom_asset_types.sql)
- **API Endpoints:** ✅ `/api/asset-types` (CRUD complete)
- **Status:** **FULLY MIGRATED** - 19 asset types in database
- **Fields:** id, name, color, description, is_active

### 4. **Locations** (`locations` table)
- **localStorage:** No previous storage (new feature)
- **Database Table:** ✅ `locations` (001_create_core_tables.sql + 009_seed_locations.sql)
- **API Endpoints:** ✅ `/api/locations` (CRUD complete - just added)
- **Status:** **FULLY MIGRATED** - 9 seeded locations
- **Fields:** id, name, location_type, address, city, country, gps coordinates, is_active

### 5. **Users** (`users` table)
- **Database Table:** ✅ `users` (001_create_core_tables.sql)
- **Authentication:** ✅ JWT tokens, password hashing, session management
- **Status:** **FULLY MIGRATED**
- **Fields:** id, username, email, full_name, role, is_active, last_login

---

## ⚠️ PARTIALLY MIGRATED (Table Exists, Not Connected)

### 6. **Box Contents** (`box_contents` table)
- **localStorage Key:** `rts.box.contents.v1`
- **Database Table:** ✅ `box_contents` (Junction table exists)
- **API Endpoints:** ✅ `/api/box-contents` (pack/unpack/clear endpoints exist)
- **Current Status:** ⚠️ **STILL USING LOCALSTORAGE** in box-packing-engine.js line 105
- **Migration Priority:** 🔴 **HIGH** - Critical logistics data
- **Fields:** box_id, item_id, packed_at, packed_by_user_id, position_in_box
- **Action Required:**
  ```javascript
  // box-packing-engine.js line 105
  boxContents = RTS.safeLoadJSON(LS_BOX_CONTENTS, null) || [];
  // Should be: boxContents = await RTS_API.getBoxContents();
  ```

### 7. **Box History / Item History / Truck History**
- **localStorage Key:** `rts.box.history.v1`
- **Database Tables:** ✅ `box_history`, `item_history`, `truck_history` (002_create_history_tables.sql)
- **API Endpoints:** ✅ `/api/history` (POST endpoint exists)
- **Current Status:** ⚠️ **STILL USING LOCALSTORAGE** in box-packing-engine.js line 106
- **Migration Priority:** 🟡 **MEDIUM** - Audit trail important for compliance
- **Fields:** id, [box/item/truck]_id, action, details, performed_by_user_id, timestamp, from/to location
- **Action Required:**
  ```javascript
  // box-packing-engine.js line 106
  boxHistory = RTS.safeLoadJSON(LS_BOX_HISTORY, null) || [];
  // Should fetch from API and log actions via /api/history
  ```

### 8. **Events** (`events` table)
- **localStorage Key:** `rts.events.v4`
- **Database Table:** ✅ `events` (001_create_core_tables.sql)
- **API Endpoints:** ✅ `/api/events` (generic collection endpoint)
- **Current Status:** ⚠️ **STILL USING LOCALSTORAGE**
- **Used By:** strategy.html, tasks.html, drivers.html, events.html
- **Migration Priority:** 🟡 **MEDIUM** - Shared across multiple modules
- **Fields:** id, name, circuit, country, start_date, end_date, event_type, status, notes
- **Action Required:** Update all pages to use `RTS.apiGetCollection('events')` and `RTS.apiSyncCollection('events', items)`

### 9. **Trucks & Load Plans**
- **localStorage Keys:** `rts.load.trucks.v2`, `rts.load.plans.v2`, `rts.load.current.v2`
- **Database Tables:** ✅ `trucks`, `load_plans`, `load_plan_boxes`, `truck_zones` (001_create_core_tables.sql)
- **API Endpoints:** ❌ No dedicated routes yet
- **Current Status:** ⚠️ **NOT CONNECTED** - Tables exist but not used
- **Migration Priority:** 🟡 **MEDIUM** - Important for logistics planning
- **Action Required:** Create API routes in server/routes/trucks.js and server/routes/load-plans.js

---

## ❌ NOT MIGRATED (Needs Tables + API)

### 10. **Tasks**
- **localStorage Key:** `rts.tasks.v4`
- **Database Table:** ❌ **MISSING** - Using generic `collections` table
- **Current Status:** ❌ Using localStorage
- **Migration Priority:** 🟡 **MEDIUM** - Task management important
- **Recommended Schema:**
  ```sql
  CREATE TABLE tasks (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'medium',
    assigned_to_user_id VARCHAR(36),
    event_id VARCHAR(36),
    due_date DATE,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```

### 11. **Notes**
- **localStorage Key:** `rts.notes.v1`
- **Database Table:** ❌ **MISSING**
- **Current Status:** ❌ Using localStorage (notes.html)
- **Migration Priority:** 🟢 **LOW** - Personal notes, less critical
- **Recommended Schema:**
  ```sql
  CREATE TABLE notes (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255),
    content TEXT,
    tags TEXT[],
    is_pinned BOOLEAN DEFAULT FALSE,
    created_by_user_id VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```

### 12. **Runbooks**
- **localStorage Key:** Unknown (likely generic collections)
- **Database Table:** ❌ **MISSING**
- **Current Status:** ❌ Using collections table
- **Migration Priority:** 🟡 **MEDIUM** - Operational procedures important
- **Recommended Schema:**
  ```sql
  CREATE TABLE runbooks (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    content TEXT,
    steps JSONB,
    tags TEXT[],
    version INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_by_user_id VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```

### 13. **Drivers**
- **localStorage Key:** Likely `rts.drivers.v1`
- **Database Table:** ❌ **MISSING**
- **Current Status:** ❌ Using collections table or localStorage
- **Migration Priority:** 🟡 **MEDIUM** - Driver management important
- **Recommended Schema:**
  ```sql
  CREATE TABLE drivers (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    license_number VARCHAR(100),
    category VARCHAR(50),
    team VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active',
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    emergency_contact JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```

### 14. **Expenses**
- **localStorage Key:** Likely `rts.expenses.v1`
- **Database Table:** ❌ **MISSING**
- **Current Status:** ❌ Using collections table
- **Migration Priority:** 🟡 **MEDIUM** - Financial tracking important
- **Recommended Schema:**
  ```sql
  CREATE TABLE expenses (
    id VARCHAR(36) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    event_id VARCHAR(36),
    date DATE NOT NULL,
    paid_by_user_id VARCHAR(36),
    receipt_url TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```

### 15. **Inventory (Duplicate?)**
- **localStorage Key:** `rts.inventory.v4`
- **Current Status:** ⚠️ **UNCLEAR** - Items table already exists
- **Migration Priority:** 🔴 **INVESTIGATE** - May be duplicate of items table or different use case
- **Action Required:** Investigate if inventory.html is tracking something different from items table

### 16. **Purchase Orders / Drafts**
- **localStorage Keys:** `rts.podrafts.v1`, `rts.orders.v1`
- **Database Table:** ❌ **MISSING**
- **Current Status:** ❌ Using localStorage
- **Migration Priority:** 🟡 **MEDIUM** - Procurement tracking
- **Recommended Schema:**
  ```sql
  CREATE TABLE purchase_orders (
    id VARCHAR(36) PRIMARY KEY,
    po_number VARCHAR(100) UNIQUE,
    supplier VARCHAR(255),
    status VARCHAR(50) DEFAULT 'draft',
    total_amount DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    order_date DATE,
    expected_delivery_date DATE,
    items JSONB,
    notes TEXT,
    created_by_user_id VARCHAR(36),
    approved_by_user_id VARCHAR(36),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```

---

## 🔧 CORRECT TO KEEP IN LOCALSTORAGE

### UI Preferences (Keep Local)
- ✅ `rts.settings.ui.v1` - User interface preferences
- ✅ `rts.settings.panes.v1` - Panel sizes/positions
- ✅ `rts.inventory.cols.v1` - Column visibility
- ✅ `theme` - Light/dark mode preference
- ✅ `auth_token` - JWT authentication token
- ✅ `user` - Current user session data

**Rationale:** These are user-specific, device-specific preferences that should not sync across devices or users.

---

## 📋 MIGRATION PRIORITY ROADMAP

### 🔴 HIGH PRIORITY (Do Immediately)
1. **Box Contents** - Critical logistics data currently stuck in localStorage
   - Update box-packing-engine.js to use `/api/box-contents` endpoints
   - Test pack/unpack/clear operations
   
2. **Investigate Inventory** - Determine if it's duplicate of items or separate concept

### 🟡 MEDIUM PRIORITY (Next Sprint)
3. **Box/Item/Truck History** - Audit trail for compliance
4. **Events** - Shared across multiple modules
5. **Tasks** - Create dedicated table + API routes
6. **Trucks & Load Plans** - Tables exist, need API routes
7. **Drivers** - Create table + API routes
8. **Runbooks** - Create table + API routes
9. **Expenses** - Create table + API routes
10. **Purchase Orders** - Create table + API routes

### 🟢 LOW PRIORITY (Future Enhancement)
11. **Notes** - Personal notes, less critical for team operations

---

## 📊 STATISTICS

- **Total Data Types:** 16
- **Fully Migrated:** 5 (31%)
- **Partially Migrated (table exists):** 4 (25%)
- **Not Migrated:** 7 (44%)
- **Keep Local:** 6 UI preferences

**Database Coverage:** 56% of business data is in PlanetScale  
**Target:** 100% by end of Q2 2026

---

## 🚀 NEXT STEPS

1. **Immediate:** Fix box_contents and box_history to use API instead of localStorage
2. **This Week:** Create migration for tasks table and connect API
3. **Next Week:** Create migrations for drivers, runbooks, expenses, purchase_orders
4. **Following Week:** Connect trucks and load_plans to UI
5. **Test:** Ensure all data persists across browser sessions and devices
6. **Cleanup:** Remove localStorage fallbacks once API is stable

---

## 📝 NOTES

- Generic `collections` table currently used as fallback for some data types
- Consider creating dedicated tables for better performance and type safety
- All new tables should follow existing naming conventions (snake_case, VARCHAR(36) for IDs)
- Add appropriate indexes for query performance
- Include created_at and updated_at timestamps on all tables
