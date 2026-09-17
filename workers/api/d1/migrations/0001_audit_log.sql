-- Centralized, append-only audit log for API events.
-- Written fire-and-forget from the revibase-api worker (never blocks a response).
--
-- Only the fields common to (nearly) every event are first-class columns; all
-- event-specific data lives in detail_json. Correlation keys are kept as
-- indexed columns when present:
--   session_id  = optional session cookie jti
--   intent_hash = optional intent correlation
--
-- detail_json carries the rest, e.g. code, feePayer, origin, ms, request_id,
-- and per-event extras (lamports, signature, ...).

CREATE TABLE IF NOT EXISTS audit_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             INTEGER NOT NULL,       -- Date.now()
  event          TEXT    NOT NULL,       -- sign | fee_credit | fee_debit | accessory_unlock | owner_browse | …
  phygital_token TEXT,
  actor          TEXT,                   -- accessory | system
  ok             INTEGER,                -- 1 / 0 / NULL
  session_id     TEXT,                   -- optional session jti (correlation)
  intent_hash    TEXT,                   -- optional correlation
  detail_json    TEXT                    -- everything event-specific
);

CREATE INDEX IF NOT EXISTS audit_log_token_ts ON audit_log (phygital_token, ts);
CREATE INDEX IF NOT EXISTS audit_log_event_ts ON audit_log (event, ts);
CREATE INDEX IF NOT EXISTS audit_log_session  ON audit_log (session_id);
CREATE INDEX IF NOT EXISTS audit_log_intent   ON audit_log (intent_hash);
