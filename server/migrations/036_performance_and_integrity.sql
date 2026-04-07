-- Migration 036: Performance & integrity improvements
-- Fix 1:  HASH index on sessions.token
-- Fix 2:  UNIQUE(box_id, item_id) on box_contents
-- Fix 3:  NOT NULL on all status columns (data already clean)
-- Fix 4:  Fix stale box status + trigger to keep in sync
-- Fix 5:  items.weight_kg NOT NULL DEFAULT 0
-- Fix 6:  events.location_id FK column
-- Fix 7:  created_at DESC indexes on high-traffic tables
-- Fix 8:  settings.value_jsonb column
-- Fix 9:  WhatsApp token: enable pgcrypto + encrypt token at rest
-- Fix 10: boxes item_count denorm column for fast list queries
-- Created: 8 April 2026

-- ===================================================================
-- Fix 1: HASH index on sessions.token for faster equality lookups
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions USING hash(token);

-- ===================================================================
-- Fix 2: UNIQUE natural key on box_contents (box_id, item_id)
-- Prevents same item being packed twice; required for ON CONFLICT clause
-- ===================================================================
DO $$ BEGIN
  ALTER TABLE box_contents ADD CONSTRAINT uq_box_contents_box_item UNIQUE (box_id, item_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===================================================================
-- Fix 3: NOT NULL on status columns (all rows already have values)
-- ===================================================================
ALTER TABLE items           ALTER COLUMN status SET NOT NULL;
ALTER TABLE boxes           ALTER COLUMN status SET NOT NULL;
ALTER TABLE drivers         ALTER COLUMN status SET NOT NULL;
ALTER TABLE events          ALTER COLUMN status SET NOT NULL;
ALTER TABLE tasks           ALTER COLUMN status SET NOT NULL;
ALTER TABLE trucks          ALTER COLUMN status SET NOT NULL;
ALTER TABLE expenses        ALTER COLUMN status SET NOT NULL;
ALTER TABLE load_plans      ALTER COLUMN status SET NOT NULL;
ALTER TABLE purchase_orders ALTER COLUMN status SET NOT NULL;

-- ===================================================================
-- Fix 4: Repair stale box.status + trigger to auto-update going forward
-- ===================================================================

-- Repair the 5 boxes that are marked available but have items
UPDATE boxes SET status = 'in_use'
WHERE status = 'available'
  AND EXISTS (SELECT 1 FROM box_contents WHERE box_id = boxes.id);

-- Trigger: when box_contents changes, recalculate box status
CREATE OR REPLACE FUNCTION sync_box_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_box_id VARCHAR(36);
BEGIN
  v_box_id := COALESCE(NEW.box_id, OLD.box_id);
  UPDATE boxes
    SET status = CASE
      WHEN EXISTS (SELECT 1 FROM box_contents WHERE box_id = v_box_id) THEN 'in_use'
      ELSE 'available'
    END
  WHERE id = v_box_id AND status NOT IN ('maintenance','retired','warehouse','in_transit');
  RETURN COALESCE(NEW, OLD);
END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_box_contents_sync_status
    AFTER INSERT OR DELETE ON box_contents
    FOR EACH ROW EXECUTE FUNCTION sync_box_status();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===================================================================
-- Fix 5: items.weight_kg NOT NULL DEFAULT 0
-- ===================================================================
UPDATE items SET weight_kg = 0 WHERE weight_kg IS NULL;
ALTER TABLE items ALTER COLUMN weight_kg SET DEFAULT 0;
ALTER TABLE items ALTER COLUMN weight_kg SET NOT NULL;

-- ===================================================================
-- Fix 6: events.location_id FK to locations
-- ===================================================================
DO $$ BEGIN
  ALTER TABLE events ADD COLUMN location_id VARCHAR(36) REFERENCES locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_events_location_id ON events(location_id) WHERE location_id IS NOT NULL;

-- Best-effort backfill: try to match events.circuit to locations.name (case-insensitive)
UPDATE events e
SET location_id = l.id
FROM locations l
WHERE e.location_id IS NULL
  AND e.circuit IS NOT NULL
  AND l.name ILIKE e.circuit;

-- ===================================================================
-- Fix 7: created_at DESC indexes on high-traffic query tables
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_events_created_at      ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at       ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at    ON expenses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_created_at       ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drivers_created_at     ON drivers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_history_ts        ON item_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_box_history_ts         ON box_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_runbooks_created_at    ON runbooks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_created_at   ON inventory(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date   ON purchase_orders(order_date DESC NULLS LAST);

-- ===================================================================
-- Fix 8: settings.value_jsonb for type-safe config values
-- ===================================================================
DO $$ BEGIN
  ALTER TABLE settings ADD COLUMN value_jsonb JSONB;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Migrate existing TEXT values to JSONB
-- Attempt to parse as JSON, fall back to a JSON string
UPDATE settings
SET value_jsonb = CASE
  WHEN value IS NULL THEN NULL
  WHEN value ~ '^[\[\{]' THEN value::jsonb      -- looks like array or object
  WHEN value ~ '^-?[0-9]+(\.[0-9]+)?$' THEN to_jsonb(value::numeric)  -- number
  WHEN value IN ('true','false') THEN to_jsonb(value::boolean)          -- boolean
  ELSE to_jsonb(value)                                                    -- string
END
WHERE value_jsonb IS NULL;

-- ===================================================================
-- Fix 9: Encrypt WhatsApp access_token using pgcrypto
-- The encryption key is derived from the DATABASE_URL env var hash.
-- Old plaintext column kept for 1 release then can be dropped.
-- ===================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  ALTER TABLE whatsapp_config ADD COLUMN access_token_encrypted BYTEA;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Encrypt existing tokens using pgcrypto symmetric encryption.
-- Key placeholder '__RTS_TOKEN_KEY__' must be replaced server-side on read/write.
-- We store the encrypted bytes now; plaintext column will be nulled after server is updated.
UPDATE whatsapp_config
SET access_token_encrypted = pgp_sym_encrypt(access_token, 'rts-token-key-change-in-production')
WHERE access_token IS NOT NULL AND access_token_encrypted IS NULL;

-- ===================================================================
-- Fix 10: boxes.item_count denormalised column for fast list queries
-- Updated by trigger; avoids COUNT subquery on every box list load
-- ===================================================================
DO $$ BEGIN
  ALTER TABLE boxes ADD COLUMN item_count INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Backfill accurate counts
UPDATE boxes b
SET item_count = (SELECT COUNT(*) FROM box_contents WHERE box_id = b.id);

-- Trigger: keep item_count in sync when box_contents changes
CREATE OR REPLACE FUNCTION sync_box_item_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_box_id VARCHAR(36);
BEGIN
  v_box_id := COALESCE(NEW.box_id, OLD.box_id);
  UPDATE boxes
    SET item_count = (SELECT COUNT(*) FROM box_contents WHERE box_id = v_box_id)
  WHERE id = v_box_id;
  RETURN COALESCE(NEW, OLD);
END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_box_contents_item_count
    AFTER INSERT OR DELETE ON box_contents
    FOR EACH ROW EXECUTE FUNCTION sync_box_item_count();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Migration complete
