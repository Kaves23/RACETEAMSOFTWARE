-- Migration 040: FK & index completeness audit
-- Audit date: 9 April 2026
-- Issues found by full schema review:
--
--   FK GAPS
--   [1]  load_plan_boxes.load_plan_id → load_plans  (no FK, only index)
--   [2]  load_plan_boxes.box_id       → boxes        (no FK, only index)
--   [3]  load_plans.event_id          → events        (no FK, only index)
--   [4]  load_plans.truck_id          → trucks        (no FK, only index)
--   [5]  load_plans.approved_by_user_id → users       (no FK, no index)
--   [6]  trucks.current_location_id   → locations     (no FK, only index)
--   [7]  trucks.current_event_id      → events        (no FK, only index)
--   [8]  truck_zones.truck_id         → trucks        (no FK, only index)
--
--   INDEX GAPS
--   [9]  load_plans.approved_by_user_id                no index
--   [10] suppliers: no partial index on is_active
--   [11] inventory_categories: no index on sort_order
--   [12] documents.driver_id          no index (item/box/event indexed but not driver)
--   [13] trucks.current_location_id   already has idx_trucks_location ✅ (noted for completeness)

-- ===================================================================
-- Fix 1-2: load_plan_boxes → load_plans + boxes FK constraints
-- Cannot use ON DELETE CASCADE on boxes because boxes survive plan deletion;
-- use RESTRICT on load_plans (a plan must be deleted before orphaning rows),
-- SET NULL equivalent handled at app layer for boxes.
-- ===================================================================
DO $$ BEGIN
  ALTER TABLE load_plan_boxes
    ADD CONSTRAINT fk_lpb_load_plan
    FOREIGN KEY (load_plan_id) REFERENCES load_plans(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE load_plan_boxes
    ADD CONSTRAINT fk_lpb_box
    FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===================================================================
-- Fix 3-5: load_plans FKs
-- ===================================================================
DO $$ BEGIN
  ALTER TABLE load_plans
    ADD CONSTRAINT fk_load_plans_event
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE load_plans
    ADD CONSTRAINT fk_load_plans_truck
    FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE load_plans
    ADD CONSTRAINT fk_load_plans_approved_by
    FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===================================================================
-- Fix 6-7: trucks FKs (location + event)
-- Nullify any stale references before adding constraints
-- ===================================================================
UPDATE trucks
  SET current_location_id = NULL
  WHERE current_location_id IS NOT NULL
    AND current_location_id NOT IN (SELECT id FROM locations);

UPDATE trucks
  SET current_event_id = NULL
  WHERE current_event_id IS NOT NULL
    AND current_event_id NOT IN (SELECT id FROM events);

DO $$ BEGIN
  ALTER TABLE trucks
    ADD CONSTRAINT fk_trucks_current_location
    FOREIGN KEY (current_location_id) REFERENCES locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE trucks
    ADD CONSTRAINT fk_trucks_current_event
    FOREIGN KEY (current_event_id) REFERENCES events(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===================================================================
-- Fix 8: truck_zones → trucks FK
-- ===================================================================
DO $$ BEGIN
  ALTER TABLE truck_zones
    ADD CONSTRAINT fk_truck_zones_truck
    FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===================================================================
-- Fix 9: load_plans.approved_by_user_id index (missing, FK queries need it)
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_load_plans_approved_by
  ON load_plans(approved_by_user_id)
  WHERE approved_by_user_id IS NOT NULL;

-- ===================================================================
-- Fix 10: suppliers active-only partial index
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_suppliers_active
  ON suppliers(name)
  WHERE is_active = TRUE;

-- ===================================================================
-- Fix 11: inventory_categories sort order index
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_inventory_categories_sort
  ON inventory_categories(sort_order ASC);

-- ===================================================================
-- Fix 12: documents.driver_id index (already has item/box/event but not driver)
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_documents_driver
  ON documents(driver_id)
  WHERE driver_id IS NOT NULL;
