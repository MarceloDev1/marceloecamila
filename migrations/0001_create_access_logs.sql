CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visited_at TEXT NOT NULL,
  host TEXT,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  colo TEXT,
  timezone TEXT,
  latitude REAL,
  longitude REAL,
  asn INTEGER,
  as_organization TEXT,
  user_agent TEXT,
  referer TEXT,
  ray_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_logs_visited_at
ON access_logs (visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_logs_ip
ON access_logs (ip);

CREATE INDEX IF NOT EXISTS idx_access_logs_country
ON access_logs (country);