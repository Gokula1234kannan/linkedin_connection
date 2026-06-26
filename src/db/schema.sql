-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  status       TEXT    DEFAULT 'ACTIVE',
  daily_limit  INTEGER DEFAULT 20,
  hourly_limit INTEGER DEFAULT 4,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Leads table  (linkedin_url unique so we never double-process the same person)
CREATE TABLE IF NOT EXISTS leads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id   INTEGER,
  first_name    TEXT,
  last_name     TEXT,
  company       TEXT,
  job_title     TEXT,
  linkedin_url  TEXT,
  email         TEXT,
  location      TEXT,
  notes         TEXT,
  message       TEXT,
  status        TEXT DEFAULT 'IMPORTED',
  error_reason  TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
);

-- Outreach jobs queue
CREATE TABLE IF NOT EXISTS outreach_jobs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id        INTEGER,
  campaign_id    INTEGER,
  status         TEXT DEFAULT 'QUEUED',
  scheduled_at   DATETIME,
  started_at     DATETIME,
  finished_at    DATETIME,
  error_reason   TEXT,
  screenshot_path TEXT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(lead_id)    REFERENCES leads(id),
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
);

-- Activity log (for future auditing)
CREATE TABLE IF NOT EXISTS activity_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER,
  event_type  TEXT,
  message     TEXT,
  metadata    TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Risk events (friction, captcha, limits hit)
CREATE TABLE IF NOT EXISTS risk_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  severity        TEXT,
  event_type      TEXT,
  message         TEXT,
  screenshot_path TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Persistent key-value store (e.g., worker state)
CREATE TABLE IF NOT EXISTS system_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);
