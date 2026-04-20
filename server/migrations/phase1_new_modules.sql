-- Phase 1 Migration: Sporting + Technical + Build + HR tables
-- Run with: psql $DATABASE_URL -f server/migrations/phase1_new_modules.sql

-- ═══════════════════════════════════════════════════════════
-- SPORTING
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sporting_calendar (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name    TEXT NOT NULL,
  series        TEXT,
  round_number  INT,
  circuit       TEXT,
  country       TEXT,
  city          TEXT,
  start_date    DATE,
  end_date      DATE,
  status        TEXT DEFAULT 'scheduled',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sporting_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name    TEXT NOT NULL,
  series        TEXT,
  entry_number  TEXT,
  car_number    TEXT,
  driver_name   TEXT,
  team_name     TEXT,
  category      TEXT,
  status        TEXT DEFAULT 'submitted',
  entry_date    DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regulations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  series          TEXT,
  regulation_type TEXT,
  version         TEXT,
  effective_date  DATE,
  document_url    TEXT,
  status          TEXT DEFAULT 'active',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS penalties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name    TEXT,
  driver_name   TEXT NOT NULL,
  car_number    TEXT,
  penalty_type  TEXT,
  time_penalty  NUMERIC,
  points_penalty INT,
  status        TEXT DEFAULT 'issued',
  issued_by     TEXT,
  reason        TEXT,
  penalty_date  DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitor_intel (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_name TEXT NOT NULL,
  team           TEXT,
  series         TEXT,
  car_number     TEXT,
  category       TEXT,
  threat_level   TEXT DEFAULT 'medium',
  strengths      TEXT,
  weaknesses     TEXT,
  recent_results TEXT,
  data_source    TEXT,
  season        TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- TECHNICAL
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cars (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_number     TEXT NOT NULL,
  car_name       TEXT,
  chassis_number TEXT,
  year           INT,
  series         TEXT,
  status         TEXT DEFAULT 'active',
  primary_driver TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS components (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_name   TEXT NOT NULL,
  component_type   TEXT,
  serial_number    TEXT,
  part_number      TEXT,
  manufacturer     TEXT,
  status           TEXT DEFAULT 'active',
  car_number       TEXT,
  life_used        NUMERIC DEFAULT 0,
  life_total       NUMERIC,
  install_date     DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_name TEXT NOT NULL,
  car_number     TEXT,
  event_name     TEXT,
  allocated_by   TEXT,
  allocation_date DATE,
  status         TEXT DEFAULT 'allocated',
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS setups (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_number         TEXT NOT NULL,
  session            TEXT,
  event_name         TEXT,
  front_wing         TEXT,
  rear_wing          TEXT,
  ride_height_front  NUMERIC,
  ride_height_rear   NUMERIC,
  front_spring       TEXT,
  rear_spring        TEXT,
  front_arb          TEXT,
  rear_arb           TEXT,
  tyre_compound      TEXT,
  tyre_pressure      TEXT,
  fuel_load          NUMERIC,
  setup_date         DATE,
  comments           TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homologation (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_title        TEXT NOT NULL,
  part_family      TEXT,
  revision_number  TEXT,
  approval_status  TEXT DEFAULT 'pending',
  effective_date   DATE,
  expiry_date      DATE,
  governing_body   TEXT,
  part_number      TEXT,
  document_url     TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_changes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_number          TEXT,
  session             TEXT,
  event_name          TEXT,
  change_description  TEXT NOT NULL,
  requested_by        TEXT,
  approved_by         TEXT,
  reason              TEXT,
  status              TEXT DEFAULT 'requested',
  time_completed      TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tech_failures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_ref     TEXT,
  car_number      TEXT,
  component_type  TEXT,
  component_ref   TEXT,
  event_name      TEXT,
  session         TEXT,
  severity        TEXT DEFAULT 'medium',
  status          TEXT DEFAULT 'open',
  symptoms        TEXT,
  root_cause      TEXT,
  resolution      TEXT,
  date_logged     DATE,
  logged_by       TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering_data (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_type             TEXT,
  test_date             DATE,
  component_under_test  TEXT NOT NULL,
  operator              TEXT,
  facility              TEXT,
  test_parameters       TEXT,
  result                TEXT,
  result_summary        TEXT,
  data_ref              TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- BUILD
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS build_status (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_name   TEXT NOT NULL,
  car          TEXT,
  lead         TEXT,
  status       TEXT DEFAULT 'scheduled',
  priority     TEXT DEFAULT 'medium',
  start_date   DATE,
  target_date  DATE,
  progress     INT DEFAULT 0,
  description  TEXT,
  blockers     TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS build_sheets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  assembly_area   TEXT,
  revision        TEXT,
  status          TEXT DEFAULT 'draft',
  assigned_to     TEXT,
  est_time        TEXT,
  approved_by     TEXT,
  torque_specs    TEXT,
  tools_required  TEXT,
  procedure_steps TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assembly_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_desc        TEXT NOT NULL,
  build_link       TEXT,
  assigned_to      TEXT,
  car              TEXT,
  priority         TEXT DEFAULT 'medium',
  status           TEXT DEFAULT 'todo',
  est_time         TEXT,
  due_date         DATE,
  completion_notes TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS build_qc (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  car                 TEXT,
  inspection_type     TEXT,
  inspector           TEXT,
  result              TEXT DEFAULT 'pending',
  inspection_date     DATE,
  linked_sheet        TEXT,
  findings            TEXT,
  defects             TEXT,
  corrective_actions  TEXT,
  sign_off            TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS repairs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component           TEXT NOT NULL,
  component_type      TEXT,
  car                 TEXT,
  event_name          TEXT,
  mechanic            TEXT,
  damage_description  TEXT,
  repair_method       TEXT,
  status              TEXT DEFAULT 'logged',
  est_cost            NUMERIC,
  date_logged         DATE,
  date_completed      DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rebuilds (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component            TEXT NOT NULL,
  serial_number        TEXT,
  component_type       TEXT,
  lead_mechanic        TEXT,
  stage                TEXT DEFAULT 'scheduled',
  start_date           DATE,
  target_complete      DATE,
  reason               TEXT,
  parts_to_replace     TEXT,
  inspection_findings  TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consumables (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name        TEXT NOT NULL,
  category         TEXT,
  unit             TEXT,
  qty_available    NUMERIC DEFAULT 0,
  reorder_at       NUMERIC DEFAULT 0,
  supplier         TEXT,
  sku_ref          TEXT,
  unit_cost        NUMERIC,
  storage_location TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS garage_prep (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_name             TEXT NOT NULL,
  event_name           TEXT,
  responsible          TEXT,
  status               TEXT DEFAULT 'planning',
  target_date          DATE,
  completion           INT DEFAULT 0,
  items_list           TEXT,
  special_requirements TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- HR
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  role             TEXT,
  department       TEXT,
  reports_to       TEXT,
  contact          TEXT,
  employment_type  TEXT DEFAULT 'full_time',
  start_date       DATE,
  nationality      TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rotas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_name         TEXT NOT NULL,
  event_name        TEXT,
  start_date        DATE,
  end_date          DATE,
  status            TEXT DEFAULT 'draft',
  created_by        TEXT,
  staff_assignments TEXT,
  staff_count       INT DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name   TEXT NOT NULL,
  leave_type   TEXT DEFAULT 'annual',
  status       TEXT DEFAULT 'pending',
  start_date   DATE,
  end_date     DATE,
  days         NUMERIC,
  approved_by  TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name       TEXT NOT NULL,
  training_title   TEXT NOT NULL,
  provider         TEXT,
  status           TEXT DEFAULT 'scheduled',
  training_date    DATE,
  expiry_date      DATE,
  certificate_ref  TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recruitment (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_title       TEXT NOT NULL,
  department       TEXT,
  status           TEXT DEFAULT 'open',
  posted_date      DATE,
  target_start     DATE,
  applicant_count  INT DEFAULT 0,
  hiring_manager   TEXT,
  employment_type  TEXT DEFAULT 'full_time',
  salary_range     TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS welfare (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name          TEXT NOT NULL,
  type                TEXT DEFAULT 'check_in',
  date                DATE,
  notes               TEXT,
  follow_up_required  BOOLEAN DEFAULT FALSE,
  follow_up_date      DATE,
  confidential        BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medical (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name   TEXT NOT NULL,
  record_type  TEXT DEFAULT 'medical_check',
  result       TEXT DEFAULT 'pending',
  record_date  DATE,
  expiry_date  DATE,
  practitioner TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name          TEXT NOT NULL,
  reviewer            TEXT,
  review_date         DATE,
  period              TEXT,
  rating              INT CHECK (rating BETWEEN 1 AND 5),
  key_strengths       TEXT,
  development_areas   TEXT,
  goals_set           TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
