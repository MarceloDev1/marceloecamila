CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT,
  country TEXT,
  city TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_logs_created_at
ON access_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_access_logs_ip
ON access_logs (ip);

CREATE INDEX IF NOT EXISTS idx_access_logs_country
ON access_logs (country);