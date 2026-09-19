-- Atomic tap anti-replay high-water marks (replaces KV-only counter updates).
CREATE TABLE IF NOT EXISTS tap_counters (
  identifier TEXT PRIMARY KEY NOT NULL,
  c INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
