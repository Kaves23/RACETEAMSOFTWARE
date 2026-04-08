-- Migration 033: Fix location ID mismatches and add missing FK constraints
-- Items were stored with old slug-style IDs (ct.garage) instead of DB IDs (loc_ct_garage)
-- Inventory was stored with location names instead of IDs

-- Step 1: Fix items.current_location_id (old slug → real DB ID)
UPDATE items SET current_location_id = 'loc_ct_garage'      WHERE current_location_id = 'ct.garage';
UPDATE items SET current_location_id = 'loc_ct_engine_room' WHERE current_location_id = 'ct.engine_room';
UPDATE items SET current_location_id = 'loc_ct_store'       WHERE current_location_id = 'ct.store';
UPDATE items SET current_location_id = 'loc_jhb_garage'     WHERE current_location_id = 'jhb.garage';
UPDATE items SET current_location_id = 'loc_jhb_store'      WHERE current_location_id = 'jhb.store';
UPDATE items SET current_location_id = 'loc_dir'            WHERE current_location_id = 'derick_irving_racing' OR current_location_id = 'derick irving racing';
UPDATE items SET current_location_id = 'loc_truck'          WHERE current_location_id = 'truck';

-- Step 2: Fix inventory.location_id (names stored as IDs → real DB IDs)
UPDATE inventory SET location_id = 'loc_ct_garage'      WHERE LOWER(location_id) = 'ct.garage';
UPDATE inventory SET location_id = 'loc_ct_engine_room' WHERE LOWER(location_id) = 'ct.engine room';
UPDATE inventory SET location_id = 'loc_ct_store'       WHERE LOWER(location_id) = 'ct.store';
UPDATE inventory SET location_id = 'loc_jhb_garage'     WHERE LOWER(location_id) = 'jhb.garage';
UPDATE inventory SET location_id = 'loc_jhb_store'      WHERE LOWER(location_id) = 'jhb.store';
UPDATE inventory SET location_id = 'loc_dir'            WHERE LOWER(location_id) = 'derick irving racing';
UPDATE inventory SET location_id = 'loc_truck'          WHERE LOWER(location_id) = 'truck';

-- Step 3: Nullify any still-invalid location/box references before adding FK constraints
UPDATE items      SET current_location_id = NULL WHERE current_location_id IS NOT NULL AND current_location_id NOT IN (SELECT id FROM locations);
UPDATE items      SET current_box_id      = NULL WHERE current_box_id      IS NOT NULL AND current_box_id      NOT IN (SELECT id FROM boxes);
UPDATE inventory  SET location_id         = NULL WHERE location_id         IS NOT NULL AND location_id         NOT IN (SELECT id FROM locations);
UPDATE inventory  SET current_box_id      = NULL WHERE current_box_id      IS NOT NULL AND current_box_id      NOT IN (SELECT id FROM boxes);
UPDATE boxes      SET current_location_id = NULL WHERE current_location_id IS NOT NULL AND current_location_id NOT IN (SELECT id FROM locations);

-- Step 4: Remove orphaned box_contents rows (no matching box)
DELETE FROM box_contents WHERE box_id NOT IN (SELECT id FROM boxes);

-- Step 5: Add missing FK constraints
DO $$ BEGIN
  ALTER TABLE items ADD CONSTRAINT fk_items_current_box
    FOREIGN KEY (current_box_id) REFERENCES boxes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE items ADD CONSTRAINT fk_items_current_location
    FOREIGN KEY (current_location_id) REFERENCES locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE inventory ADD CONSTRAINT fk_inventory_location
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE boxes ADD CONSTRAINT fk_boxes_current_location
    FOREIGN KEY (current_location_id) REFERENCES locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE box_contents ADD CONSTRAINT fk_box_contents_box
    FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
