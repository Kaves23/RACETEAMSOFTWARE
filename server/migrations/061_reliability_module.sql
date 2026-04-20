-- Migration 061: Reliability Module
CREATE TABLE IF NOT EXISTS reliability_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  car_number TEXT,
  component TEXT NOT NULL,
  failure_mode TEXT,
  session_name TEXT,
  lap_number INT,
  severity TEXT NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor','moderate','major','critical')),
  dnf BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  immediate_action TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','closed')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES reliability_incidents(id) ON DELETE SET NULL,
  component TEXT NOT NULL,
  failure_mode TEXT,
  root_cause TEXT,
  contributing_factors TEXT,
  five_whys TEXT,
  methodology TEXT DEFAULT 'five_whys' CHECK (methodology IN ('five_whys','fishbone','fault_tree','other')),
  conclusion TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','complete','reviewed')),
  assigned_to TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corrective_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rca_id UUID REFERENCES rca(id) ON DELETE SET NULL,
  incident_id UUID REFERENCES reliability_incidents(id) ON DELETE SET NULL,
  action_title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT,
  due_date DATE,
  completed_date DATE,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled','overdue')),
  verification_method TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS preventive_maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL,
  car_number TEXT,
  task_description TEXT NOT NULL,
  interval_type TEXT NOT NULL DEFAULT 'laps' CHECK (interval_type IN ('laps','hours','events','calendar_days')),
  interval_value INT NOT NULL DEFAULT 0,
  last_done_date DATE,
  last_done_laps INT,
  next_due_date DATE,
  next_due_laps INT,
  assigned_to TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','overdue','completed','suspended')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reliability_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL,
  component_category TEXT,
  failure_count INT DEFAULT 0,
  dnf_count INT DEFAULT 0,
  mtbf_laps NUMERIC(8,2),
  reliability_score NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_title TEXT NOT NULL,
  risk_category TEXT NOT NULL DEFAULT 'technical' CHECK (risk_category IN ('technical','operational','sporting','financial','personnel','external')),
  description TEXT,
  likelihood INT NOT NULL DEFAULT 3 CHECK (likelihood BETWEEN 1 AND 5),
  impact INT NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
  risk_score INT GENERATED ALWAYS AS (likelihood * impact) STORED,
  owner TEXT,
  mitigation TEXT,
  contingency TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigated','accepted','closed')),
  review_date DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_board (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  review_type TEXT NOT NULL DEFAULT 'weekly' CHECK (review_type IN ('daily','weekly','post_event','monthly','quarterly')),
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  scheduled_date DATE,
  attendees TEXT,
  agenda TEXT,
  minutes TEXT,
  action_items TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','complete','cancelled')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rel_incidents_severity ON reliability_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_status ON corrective_actions(status);
CREATE INDEX IF NOT EXISTS idx_prev_maintenance_status ON preventive_maintenance(status);
CREATE INDEX IF NOT EXISTS idx_risk_map_status ON risk_map(status);
