-- TimescaleDB telemetry schema (optional upgrade)
-- Note: Requires TimescaleDB extension installed on your PostgreSQL server.
-- Run with a superuser or a role permitted to create extensions.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Telemetry uploads metadata
CREATE TABLE IF NOT EXISTS telemetry_uploads (
  id UUID PRIMARY KEY,
  driver_id TEXT NOT NULL,
  session_name TEXT,
  tags TEXT[],
  uploaded_ts TIMESTAMPTZ DEFAULT NOW()
);

-- Telemetry points (hypertable)
CREATE TABLE IF NOT EXISTS telemetry_points (
  upload_id UUID NOT NULL REFERENCES telemetry_uploads(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL,
  ts_ms BIGINT,
  rpm INTEGER,
  throttle DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  gear INTEGER,
  brake DOUBLE PRECISION,
  steering DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION
);

-- Convert telemetry_points into a hypertable partitioned on time
SELECT create_hypertable('telemetry_points', 'ts', if_not_exists => TRUE);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS telemetry_points_upload_ts_idx ON telemetry_points(upload_id, ts);
CREATE INDEX IF NOT EXISTS telemetry_points_driver_ts_idx ON telemetry_points USING BTREE ((
  (SELECT driver_id FROM telemetry_uploads u WHERE u.id = telemetry_points.upload_id)
), ts);
