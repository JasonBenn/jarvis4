-- Add generated_images table for photo generation functionality
CREATE TABLE IF NOT EXISTS generated_images (
  id TEXT PRIMARY KEY,
  entry_hash TEXT UNIQUE NOT NULL,
  image_url TEXT NOT NULL,
  document_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entry_hash ON generated_images(entry_hash);
