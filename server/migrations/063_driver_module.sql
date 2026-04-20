-- Migration 063: Driver Module (extended pages)
CREATE TABLE IF NOT EXISTS driver_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name TEXT NOT NULL,
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'race' CHECK (event_type IN ('race','test','simulator','media','commercial','fitness','other')),
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  end_date DATE,
  location TEXT,
  series TEXT,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name TEXT NOT NULL,
  season TEXT NOT NULL,
  series TEXT,
  contract_type TEXT NOT NULL DEFAULT 'race' CHECK (contract_type IN ('race','test','development','reserve','other')),
  value NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'GBP',
  start_date DATE,
  end_date DATE,
  option_years INT DEFAULT 0,
  management_company TEXT,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','signed','active','expired','terminated')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS simulator_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name TEXT NOT NULL,
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  session_date DATE NOT NULL,
  duration_hours NUMERIC(4,1),
  circuit TEXT,
  programme TEXT,
  engineer_name TEXT,
  objectives TEXT,
  outcomes TEXT,
  setup_correlation TEXT,
  lap_time_best TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','completed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_fitness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name TEXT NOT NULL,
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  assessment_date DATE NOT NULL,
  assessment_type TEXT NOT NULL DEFAULT 'fitness' CHECK (assessment_type IN ('fitness','medical','nutrition','mental','recovery')),
  conducted_by TEXT,
  vo2_max NUMERIC(5,1),
  resting_hr INT,
  body_fat_pct NUMERIC(4,1),
  weight_kg NUMERIC(5,1),
  neck_strength_kg NUMERIC(5,1),
  result TEXT NOT NULL DEFAULT 'pass' CHECK (result IN ('pass','conditional','fail','pending')),
  recommendations TEXT,
  next_assessment DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_debriefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name TEXT NOT NULL,
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  session_name TEXT NOT NULL,
  debrief_date DATE NOT NULL,
  engineer_name TEXT,
  balance_rating INT CHECK (balance_rating BETWEEN 1 AND 10),
  traction_rating INT CHECK (traction_rating BETWEEN 1 AND 10),
  braking_rating INT CHECK (braking_rating BETWEEN 1 AND 10),
  overall_feeling TEXT,
  key_issues TEXT,
  setup_requests TEXT,
  mental_state TEXT NOT NULL DEFAULT 'positive' CHECK (mental_state IN ('positive','neutral','frustrated','confident','struggling')),
  action_items TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name TEXT NOT NULL,
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL DEFAULT 'interview' CHECK (media_type IN ('interview','photoshoot','video','press_release','social','other')),
  title TEXT NOT NULL,
  publication TEXT,
  scheduled_date DATE,
  duration_mins INT,
  location TEXT,
  pr_contact TEXT,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  content_url TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','completed','cancelled','published')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_licences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name TEXT NOT NULL,
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  licence_type TEXT NOT NULL DEFAULT 'competition' CHECK (licence_type IN ('competition','international','superlicence','national','medical','other')),
  issuing_body TEXT NOT NULL,
  licence_number TEXT,
  issue_date DATE,
  expiry_date DATE NOT NULL,
  grade TEXT,
  superlicence_points INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expiring_soon','expired','suspended','pending')),
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name TEXT NOT NULL,
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'setup' CHECK (category IN ('setup','travel','nutrition','hotel','media','communication','other')),
  preference_key TEXT NOT NULL,
  preference_value TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS junior_programme (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name TEXT NOT NULL,
  age INT,
  nationality TEXT,
  current_series TEXT,
  programme_level TEXT NOT NULL DEFAULT 'academy' CHECK (programme_level IN ('scouting','academy','development','reserve','graduated')),
  season TEXT NOT NULL,
  coach_name TEXT,
  budget_support NUMERIC(14,2),
  results_summary TEXT,
  development_areas TEXT,
  next_milestone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','graduated','released')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_calendar_date ON driver_calendar(event_date);
CREATE INDEX IF NOT EXISTS idx_driver_contracts_status ON driver_contracts(status);
CREATE INDEX IF NOT EXISTS idx_driver_licences_expiry ON driver_licences(expiry_date);
CREATE INDEX IF NOT EXISTS idx_driver_fitness_result ON driver_fitness(result);
