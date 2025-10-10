-- Migration v1: Migrate from two-table schema to single-table schema
-- Run this manually if migration doesn't auto-run on extension reload

-- Create new highlights table
CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  status TEXT CHECK(status IN ('NEW', 'INTEGRATED', 'ARCHIVED')) DEFAULT 'NEW',
  snooze_history TEXT,
  next_show_date TEXT,
  first_seen TEXT NOT NULL,
  last_updated TEXT NOT NULL
);

-- Copy data from old highlight_states table (if it exists)
INSERT OR IGNORE INTO highlights (id, status, snooze_history, next_show_date, first_seen, last_updated)
SELECT id, status, snooze_history, next_show_date, first_seen, last_updated
FROM highlight_states
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='highlight_states');

-- Drop old tables
DROP TABLE IF EXISTS highlight_states;
DROP TABLE IF EXISTS highlight_data;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_status ON highlights(status);
CREATE INDEX IF NOT EXISTS idx_next_show_date ON highlights(next_show_date);

-- Set schema version
PRAGMA user_version = 1;

-- Clear lastReadwiseFetch to trigger fresh fetch (since we dropped highlight_data)
DELETE FROM metadata WHERE key = 'lastReadwiseFetch';
