-- Simple schema for Postgres collections & settings
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  data JSONB
);

CREATE TABLE IF NOT EXISTS collections (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data JSONB,
  PRIMARY KEY(collection,id)
);
