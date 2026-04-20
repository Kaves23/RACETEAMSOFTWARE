-- Migration 060: Performance Module
CREATE TABLE IF NOT EXISTS run_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  session_name TEXT NOT NULL,
  car_number TEXT,
  driver_name TEXT,
  planned_laps INT DEFAULT 0,
  actual_laps INT DEFAULT 0,
  fuel_load NUMERIC(6,2),
  tyre_compound TEXT,
  objectives TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tyre_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_number TEXT NOT NULL,
  compound TEXT NOT NULL,
  specification TEXT,
  car_number TEXT,
  driver_name TEXT,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  session_fitted TEXT,
  laps_used INT DEFAULT 0,
  condition TEXT NOT NULL DEFAULT 'new' CHECK (condition IN ('new','good','worn','scrapped')),
  temperature_inner NUMERIC(5,1),
  temperature_middle NUMERIC(5,1),
  temperature_outer NUMERIC(5,1),
  pressure_hot NUMERIC(5,1),
  pressure_cold NUMERIC(5,1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS benchmarking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  session_name TEXT,
  car_number TEXT,
  driver_name TEXT,
  competitor_name TEXT,
  our_best_lap TEXT,
  competitor_best_lap TEXT,
  delta_seconds NUMERIC(6,3),
  sector_1_delta NUMERIC(6,3),
  sector_2_delta NUMERIC(6,3),
  sector_3_delta NUMERIC(6,3),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name TEXT NOT NULL,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  session_name TEXT,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC(10,4),
  target_value NUMERIC(10,4),
  trend_direction TEXT CHECK (trend_direction IN ('improving','stable','declining')),
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS correlation_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  car_number TEXT,
  session_name TEXT,
  sim_lap_time TEXT,
  actual_lap_time TEXT,
  delta_seconds NUMERIC(6,3),
  correlation_pct NUMERIC(5,2),
  setup_changes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS debriefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  session_name TEXT NOT NULL,
  debrief_type TEXT NOT NULL DEFAULT 'post_session' CHECK (debrief_type IN ('post_session','post_event','mid_event')),
  driver_name TEXT,
  car_number TEXT,
  attendees TEXT,
  key_findings TEXT,
  action_items TEXT,
  balance_feedback TEXT,
  tyre_feedback TEXT,
  setup_direction TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','closed')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engineering_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  car_number TEXT,
  engineer_name TEXT,
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('general','setup','tyre','fuel','strategy','data')),
  title TEXT NOT NULL,
  content TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_plans_event ON run_plans(event_id);
CREATE INDEX IF NOT EXISTS idx_tyre_register_compound ON tyre_register(compound);
CREATE INDEX IF NOT EXISTS idx_tyre_register_condition ON tyre_register(condition);
CREATE INDEX IF NOT EXISTS idx_debriefs_event ON debriefs(event_id);
CREATE INDEX IF NOT EXISTS idx_eng_notes_priority ON engineering_notes(priority);
