-- Migration 048: Universal History & Asset Checkout System
-- Adds: activity_log, asset_checkouts, inventory_history, mileage_log,
--       post_event_notes, race_fleet

-- ── ACTIVITY LOG ──────────────────────────────────────────────────────────────
-- Universal append-only audit spine. Every route writes here after a mutation.
-- Rows are NEVER updated or deleted.

CREATE TABLE IF NOT EXISTS activity_log (
  id                    VARCHAR(36)  PRIMARY KEY,
  entity_type           VARCHAR(30)  NOT NULL,
  entity_id             VARCHAR(36)  NOT NULL,
  entity_name           VARCHAR(255),
  action                VARCHAR(50)  NOT NULL,
  event_id              VARCHAR(36),
  event_name            VARCHAR(255),
  performed_by_user_id  VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL,
  performed_by_name     VARCHAR(255),
  details               JSONB,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_entity
  ON activity_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_event
  ON activity_log (event_id, created_at DESC)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_user
  ON activity_log (performed_by_user_id, created_at DESC)
  WHERE performed_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_action
  ON activity_log (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_created
  ON activity_log (created_at DESC);


-- ── ASSET CHECKOUTS ────────────────────────────────────────────────────────────
-- Full checkout ledger. Every row is permanent (append-only).
-- returned_at IS NULL = still checked out.

CREATE TABLE IF NOT EXISTS asset_checkouts (
  id                      VARCHAR(36)  PRIMARY KEY,
  item_id                 VARCHAR(36)  NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  checked_out_by_user_id  VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL,
  checked_out_to_type     VARCHAR(20)  NOT NULL DEFAULT 'external',
  checked_out_to_id       VARCHAR(36),
  checked_out_to_name     VARCHAR(255) NOT NULL,
  event_id                VARCHAR(36),
  checked_out_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expected_return_at      TIMESTAMPTZ,
  returned_at             TIMESTAMPTZ,
  returned_by_user_id     VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL,
  condition_out           VARCHAR(30)  NOT NULL DEFAULT 'good',
  condition_in            VARCHAR(30),
  notes_out               TEXT,
  notes_in                TEXT,
  status                  VARCHAR(20)  NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_checkout_item_status
  ON asset_checkouts (item_id, status);

CREATE INDEX IF NOT EXISTS idx_checkout_to_id
  ON asset_checkouts (checked_out_to_id, status)
  WHERE checked_out_to_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkout_status_return
  ON asset_checkouts (status, expected_return_at)
  WHERE status IN ('active','overdue');

CREATE INDEX IF NOT EXISTS idx_checkout_event
  ON asset_checkouts (event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkout_checked_out_at
  ON asset_checkouts (checked_out_at DESC);


-- ── INVENTORY HISTORY ─────────────────────────────────────────────────────────
-- Records every quantity change on consumables. Append-only.

CREATE TABLE IF NOT EXISTS inventory_history (
  id                    VARCHAR(36)  PRIMARY KEY,
  inventory_id          VARCHAR(36)  NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  action                VARCHAR(30)  NOT NULL,
  qty_before            INTEGER      NOT NULL DEFAULT 0,
  qty_change            INTEGER      NOT NULL DEFAULT 0,
  qty_after             INTEGER      NOT NULL DEFAULT 0,
  event_id              VARCHAR(36),
  performed_by_user_id  VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_history_item
  ON inventory_history (inventory_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_history_event
  ON inventory_history (event_id)
  WHERE event_id IS NOT NULL;


-- ── MILEAGE LOG ───────────────────────────────────────────────────────────────
-- Odometer entries for trucks and race fleet vehicles.

CREATE TABLE IF NOT EXISTS mileage_log (
  id                 VARCHAR(36)   PRIMARY KEY,
  entity_type        VARCHAR(20)   NOT NULL DEFAULT 'truck',
  entity_id          VARCHAR(36)   NOT NULL,
  event_id           VARCHAR(36),
  odometer_start_km  DECIMAL(10,1),
  odometer_end_km    DECIMAL(10,1),
  distance_km        DECIMAL(10,1),
  driver_user_id     VARCHAR(36)   REFERENCES users(id) ON DELETE SET NULL,
  fuel_litres        DECIMAL(8,2),
  notes              TEXT,
  logged_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mileage_entity
  ON mileage_log (entity_type, entity_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_mileage_event
  ON mileage_log (event_id)
  WHERE event_id IS NOT NULL;


-- ── POST EVENT NOTES ──────────────────────────────────────────────────────────
-- Structured post-race condition notes on any asset.

CREATE TABLE IF NOT EXISTS post_event_notes (
  id                    VARCHAR(36)  PRIMARY KEY,
  entity_type           VARCHAR(20)  NOT NULL,
  entity_id             VARCHAR(36)  NOT NULL,
  event_id              VARCHAR(36)  NOT NULL,
  condition             VARCHAR(30)  NOT NULL DEFAULT 'good',
  note                  TEXT,
  action_required       BOOLEAN      NOT NULL DEFAULT FALSE,
  action_description    TEXT,
  photos                JSONB,
  created_by_user_id    VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_event_entity
  ON post_event_notes (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_event_event
  ON post_event_notes (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_event_action_required
  ON post_event_notes (action_required, created_at DESC)
  WHERE action_required = TRUE;


-- ── RACE FLEET ────────────────────────────────────────────────────────────────
-- Race karts, cars, and support vehicles. Separate from logistics trucks.

CREATE TABLE IF NOT EXISTS race_fleet (
  id                     VARCHAR(36)   PRIMARY KEY,
  name                   VARCHAR(255)  NOT NULL,
  vehicle_type           VARCHAR(20)   NOT NULL DEFAULT 'kart',
  class                  VARCHAR(100),
  make                   VARCHAR(100),
  model                  VARCHAR(100),
  year                   INTEGER,
  chassis_number         VARCHAR(100),
  engine_serial          VARCHAR(100),
  assigned_driver_id     VARCHAR(36)   REFERENCES drivers(id) ON DELETE SET NULL,
  current_event_id       VARCHAR(36)   REFERENCES events(id) ON DELETE SET NULL,
  current_location_id    VARCHAR(36)   REFERENCES locations(id) ON DELETE SET NULL,
  status                 VARCHAR(20)   NOT NULL DEFAULT 'available',
  total_race_hours       DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_mileage_km       DECIMAL(10,2) NOT NULL DEFAULT 0,
  last_service_date      DATE,
  next_service_due_hours DECIMAL(10,2),
  notes                  TEXT,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_race_fleet_status
  ON race_fleet (status);

CREATE INDEX IF NOT EXISTS idx_race_fleet_type
  ON race_fleet (vehicle_type);

CREATE INDEX IF NOT EXISTS idx_race_fleet_driver
  ON race_fleet (assigned_driver_id)
  WHERE assigned_driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_race_fleet_service_due
  ON race_fleet (next_service_due_hours)
  WHERE next_service_due_hours IS NOT NULL;
