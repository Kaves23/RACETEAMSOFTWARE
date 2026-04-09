-- Migration 041: Orphan cleanup triggers
-- Fixes two known design limitations from DATABASE_SCHEMA.md:
--
--   Issue A: entity_tags orphans
--     entity_tags uses a polymorphic pattern so FK REFERENCES cannot be used.
--     When a task/note/runbook/item/box/driver/event is deleted, its tags are
--     left behind as orphaned rows. These triggers fix that at the DB level.
--
--   Issue B: box_contents orphans from inventory deletes
--     box_contents.item_id can reference inventory.id (when item_type='inventory').
--     A FK only covers the items side (ON DELETE CASCADE added in migration 033).
--     This trigger ensures box_contents rows are also removed when an inventory
--     row is deleted.
--
-- Using AFTER DELETE triggers ensures the parent row is deleted first, then
-- the cleanup fires — no FK violation risk.

-- ===================================================================
-- Issue A: entity_tags cleanup triggers
-- One trigger per entity type (7 tables)
-- ===================================================================

CREATE OR REPLACE FUNCTION cleanup_entity_tags()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM entity_tags
  WHERE entity_type = TG_ARGV[0]
    AND entity_id = OLD.id;
  RETURN OLD;
END; $$;

-- tasks
DO $$ BEGIN
  CREATE TRIGGER trg_tasks_cleanup_tags
    AFTER DELETE ON tasks
    FOR EACH ROW EXECUTE FUNCTION cleanup_entity_tags('task');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- notes
DO $$ BEGIN
  CREATE TRIGGER trg_notes_cleanup_tags
    AFTER DELETE ON notes
    FOR EACH ROW EXECUTE FUNCTION cleanup_entity_tags('note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- runbooks
DO $$ BEGIN
  CREATE TRIGGER trg_runbooks_cleanup_tags
    AFTER DELETE ON runbooks
    FOR EACH ROW EXECUTE FUNCTION cleanup_entity_tags('runbook');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- items
DO $$ BEGIN
  CREATE TRIGGER trg_items_cleanup_tags
    AFTER DELETE ON items
    FOR EACH ROW EXECUTE FUNCTION cleanup_entity_tags('item');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- boxes
DO $$ BEGIN
  CREATE TRIGGER trg_boxes_cleanup_tags
    AFTER DELETE ON boxes
    FOR EACH ROW EXECUTE FUNCTION cleanup_entity_tags('box');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- drivers
DO $$ BEGIN
  CREATE TRIGGER trg_drivers_cleanup_tags
    AFTER DELETE ON drivers
    FOR EACH ROW EXECUTE FUNCTION cleanup_entity_tags('driver');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- events
DO $$ BEGIN
  CREATE TRIGGER trg_events_cleanup_tags
    AFTER DELETE ON events
    FOR EACH ROW EXECUTE FUNCTION cleanup_entity_tags('event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===================================================================
-- Issue A: One-time cleanup of any existing orphaned entity_tags rows
-- ===================================================================
DELETE FROM entity_tags
WHERE (entity_type = 'task'    AND entity_id NOT IN (SELECT id FROM tasks))
   OR (entity_type = 'note'    AND entity_id NOT IN (SELECT id FROM notes))
   OR (entity_type = 'runbook' AND entity_id NOT IN (SELECT id FROM runbooks))
   OR (entity_type = 'item'    AND entity_id NOT IN (SELECT id FROM items))
   OR (entity_type = 'box'     AND entity_id NOT IN (SELECT id FROM boxes))
   OR (entity_type = 'driver'  AND entity_id NOT IN (SELECT id FROM drivers))
   OR (entity_type = 'event'   AND entity_id NOT IN (SELECT id FROM events));

-- ===================================================================
-- Issue B: box_contents cleanup when an inventory item is deleted
-- ===================================================================

CREATE OR REPLACE FUNCTION cleanup_inventory_box_contents()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM box_contents
  WHERE item_id = OLD.id
    AND item_type = 'inventory';
  RETURN OLD;
END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_inventory_cleanup_box_contents
    AFTER DELETE ON inventory
    FOR EACH ROW EXECUTE FUNCTION cleanup_inventory_box_contents();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===================================================================
-- Issue B: One-time cleanup of orphaned box_contents rows where
-- the inventory item no longer exists
-- ===================================================================
DELETE FROM box_contents
WHERE item_type = 'inventory'
  AND item_id NOT IN (SELECT id FROM inventory);
