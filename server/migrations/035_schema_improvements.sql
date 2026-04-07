-- Migration 035: Schema improvements
-- Fix 1:  updated_at auto-trigger on all tables
-- Fix 2:  CHECK constraints for enum-like VARCHAR columns (new & existing tables)
-- Fix 3:  Missing FK constraints (history, tasks, notes, expenses, runbooks, box_contents)
-- Fix 4:  purchase_order_items junction table (replaces TEXT blob)
-- Fix 5:  alerts + documents tables with real FK columns (not polymorphic)
-- Fix 6:  Partial UNIQUE index on items.serial_number
-- Fix 7:  Index on sessions.expires_at
-- Fix 9:  entity_tags junction table + migrate existing TEXT tags
-- Fix 10: drivers.user_id FK column linking to users
-- (Fix 8 is a server-code change in box-contents.js / items.js)
-- Created: 7 April 2026

-- ===================================================================
-- Fix 1: updated_at trigger function + triggers for every main table
-- ===================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'items','boxes','trucks','drivers','events','tasks','notes',
    'runbooks','inventory','users','purchase_orders','locations','load_plans'
  ]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trg_' || t || '_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- ===================================================================
-- Fix 3: Missing FK constraints
-- (All wrapped in DO blocks to be idempotent / skip if already exists)
-- ===================================================================

-- item_history → items (cascade delete history when item deleted)
DO $$ BEGIN
  ALTER TABLE item_history ADD CONSTRAINT fk_item_history_item
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- item_history → users
DO $$ BEGIN
  ALTER TABLE item_history ADD CONSTRAINT fk_item_history_user
    FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- box_history → users
DO $$ BEGIN
  ALTER TABLE box_history ADD CONSTRAINT fk_box_history_user
    FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- truck_history → users
DO $$ BEGIN
  ALTER TABLE truck_history ADD CONSTRAINT fk_truck_history_user
    FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- box_contents → users (who packed it)
DO $$ BEGIN
  ALTER TABLE box_contents ADD CONSTRAINT fk_box_contents_user
    FOREIGN KEY (packed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tasks → events
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT fk_tasks_event
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tasks → users (assigned)
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT fk_tasks_assigned_user
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tasks → users (created by)
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT fk_tasks_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- notes → events
DO $$ BEGIN
  ALTER TABLE notes ADD CONSTRAINT fk_notes_event
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- notes → users
DO $$ BEGIN
  ALTER TABLE notes ADD CONSTRAINT fk_notes_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- runbooks → events
DO $$ BEGIN
  ALTER TABLE runbooks ADD CONSTRAINT fk_runbooks_event
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- runbooks → users
DO $$ BEGIN
  ALTER TABLE runbooks ADD CONSTRAINT fk_runbooks_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- expenses → events
DO $$ BEGIN
  ALTER TABLE expenses ADD CONSTRAINT fk_expenses_event
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- expenses → users (paid by)
DO $$ BEGIN
  ALTER TABLE expenses ADD CONSTRAINT fk_expenses_paid_by
    FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- expenses → users (created by)
DO $$ BEGIN
  ALTER TABLE expenses ADD CONSTRAINT fk_expenses_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- expenses → users (approved by)
DO $$ BEGIN
  ALTER TABLE expenses ADD CONSTRAINT fk_expenses_approved_by
    FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===================================================================
-- Fix 4: purchase_order_items junction table
-- Replaces the denormalized TEXT blob in purchase_orders.items
-- ===================================================================

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id            VARCHAR(36)   PRIMARY KEY DEFAULT gen_random_uuid()::text,
  po_id         VARCHAR(36)   NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_id  VARCHAR(36)   REFERENCES inventory(id) ON DELETE SET NULL,
  description   VARCHAR(255),
  quantity      INTEGER       NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price    DECIMAL(10,2),
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_po_items_po        ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_inventory ON purchase_order_items(inventory_id);

-- ===================================================================
-- Fix 5: Create alerts + documents tables with direct FK columns
-- (Avoids polymorphic entity_type/entity_id anti-pattern)
-- ===================================================================

CREATE TABLE IF NOT EXISTS alerts (
  id                  VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
  alert_type          VARCHAR(50)  NOT NULL CHECK (alert_type IN (
                        'maintenance_due','capacity_warning','missing_item',
                        'expired_item','compliance','temperature','damage','other')),
  severity            VARCHAR(20)  NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  title               VARCHAR(255) NOT NULL,
  message             TEXT,
  -- Specific typed FK columns instead of generic entity_type/entity_id
  item_id             VARCHAR(36)  REFERENCES items(id)   ON DELETE SET NULL,
  box_id              VARCHAR(36)  REFERENCES boxes(id)   ON DELETE SET NULL,
  truck_id            VARCHAR(36)  REFERENCES trucks(id)  ON DELETE SET NULL,
  event_id            VARCHAR(36)  REFERENCES events(id)  ON DELETE SET NULL,
  driver_id           VARCHAR(36)  REFERENCES drivers(id) ON DELETE SET NULL,
  is_read             BOOLEAN      NOT NULL DEFAULT FALSE,
  is_resolved         BOOLEAN      NOT NULL DEFAULT FALSE,
  resolved_by_user_id VARCHAR(36)  REFERENCES users(id)   ON DELETE SET NULL,
  resolved_at         TIMESTAMP,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON alerts(severity, created_at DESC) WHERE is_resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_alerts_item       ON alerts(item_id)   WHERE item_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_box        ON alerts(box_id)    WHERE box_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_event      ON alerts(event_id)  WHERE event_id  IS NOT NULL;

DO $$ BEGIN
  CREATE TRIGGER trg_alerts_updated_at BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS documents (
  id                  VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_type       VARCHAR(50)  NOT NULL CHECK (document_type IN (
                        'manual','certificate','invoice','compliance',
                        'photo','inspection_report','other')),
  title               VARCHAR(255) NOT NULL,
  description         TEXT,
  file_url            TEXT,
  file_size_bytes     BIGINT,
  mime_type           VARCHAR(100),
  -- Specific typed FK columns
  item_id             VARCHAR(36)  REFERENCES items(id)   ON DELETE SET NULL,
  box_id              VARCHAR(36)  REFERENCES boxes(id)   ON DELETE SET NULL,
  truck_id            VARCHAR(36)  REFERENCES trucks(id)  ON DELETE SET NULL,
  event_id            VARCHAR(36)  REFERENCES events(id)  ON DELETE SET NULL,
  driver_id           VARCHAR(36)  REFERENCES drivers(id) ON DELETE SET NULL,
  uploaded_by_user_id VARCHAR(36)  REFERENCES users(id)   ON DELETE SET NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_type  ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_item  ON documents(item_id)  WHERE item_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_event ON documents(event_id) WHERE event_id IS NOT NULL;

DO $$ BEGIN
  CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===================================================================
-- Fix 6: Partial unique index on items.serial_number
-- Excludes NULL and empty string (4 items share "" which is meaningless)
-- ===================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_serial_number_unique
  ON items(serial_number)
  WHERE serial_number IS NOT NULL AND serial_number <> '';

-- ===================================================================
-- Fix 7: Index on sessions.expires_at (used in cleanup DELETE queries)
-- ===================================================================

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ===================================================================
-- Fix 9: entity_tags junction table + migrate existing TEXT tag fields
-- ===================================================================

CREATE TABLE IF NOT EXISTS entity_tags (
  entity_type  VARCHAR(20)  NOT NULL CHECK (entity_type IN ('task','note','runbook','item','box','driver','event')),
  entity_id    VARCHAR(36)  NOT NULL,
  tag          VARCHAR(100) NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_type, entity_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_entity_tags_tag    ON entity_tags(tag);
CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags(entity_type, entity_id);

-- Migrate tasks.tags (TEXT, comma-separated, may also be JSON arrays like '["urgent","setup"]')
-- Strip leading/trailing brackets and split on comma
INSERT INTO entity_tags (entity_type, entity_id, tag)
SELECT 'task', id,
  REGEXP_REPLACE(TRIM(t.tag), '^["'']|["'']$', '', 'g')
FROM tasks,
  LATERAL unnest(
    string_to_array(
      REGEXP_REPLACE(REGEXP_REPLACE(TRIM(tags), '^\[|\]$', '', 'g'), '\s*,\s*', ','),
      ','
    )
  ) AS t(tag)
WHERE tags IS NOT NULL
  AND TRIM(tags) NOT IN ('', '[]', 'null')
  AND TRIM(t.tag) NOT IN ('', 'null')
ON CONFLICT DO NOTHING;

-- Migrate notes.tags
INSERT INTO entity_tags (entity_type, entity_id, tag)
SELECT 'note', id,
  REGEXP_REPLACE(TRIM(t.tag), '^["'']|["'']$', '', 'g')
FROM notes,
  LATERAL unnest(
    string_to_array(
      REGEXP_REPLACE(REGEXP_REPLACE(TRIM(tags), '^\[|\]$', '', 'g'), '\s*,\s*', ','),
      ','
    )
  ) AS t(tag)
WHERE tags IS NOT NULL
  AND TRIM(tags) NOT IN ('', '[]', 'null')
  AND TRIM(t.tag) NOT IN ('', 'null')
ON CONFLICT DO NOTHING;

-- Migrate runbooks.tags
INSERT INTO entity_tags (entity_type, entity_id, tag)
SELECT 'runbook', id,
  REGEXP_REPLACE(TRIM(t.tag), '^["'']|["'']$', '', 'g')
FROM runbooks,
  LATERAL unnest(
    string_to_array(
      REGEXP_REPLACE(REGEXP_REPLACE(TRIM(tags), '^\[|\]$', '', 'g'), '\s*,\s*', ','),
      ','
    )
  ) AS t(tag)
WHERE tags IS NOT NULL
  AND TRIM(tags) NOT IN ('', '[]', 'null')
  AND TRIM(t.tag) NOT IN ('', 'null')
ON CONFLICT DO NOTHING;

-- ===================================================================
-- Fix 10: Add user_id FK to drivers table (links driver ↔ user account)
-- ===================================================================

DO $$ BEGIN
  ALTER TABLE drivers ADD COLUMN user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_user_id_unique
  ON drivers(user_id)
  WHERE user_id IS NOT NULL;

-- Migration complete
