-- Centralized, append-only audit log for verifier events.
-- Written fire-and-forget from the revibase-api worker (never blocks a response).
-- Replaces the per-token, DO-local pending_approvals "audit trail": the DO now
-- keeps only open inbox rows; the durable history lives here and is queryable
-- across all tokens.
--
-- Only the fields common to (nearly) every event are first-class columns; all
-- event-specific data lives in detail_json. The two exceptions are the
-- correlation keys, kept as indexed columns because the feature hinges on
-- chaining events by them:
--   session_id  = verifier bearer jti — links connect -> preview -> sign.
--   intent_hash = links preview / pending_approval / grant / sign.
--
-- detail_json carries the rest, e.g. code, credential_id (owner/visitor
-- passkey), verifier, origin, ms, request_id, and per-event extras
-- (resolution, lamports, signature, configAction, ...).

CREATE TABLE IF NOT EXISTS audit_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             INTEGER NOT NULL,       -- Date.now()
  event          TEXT    NOT NULL,       -- connect | connect_tap | preview | sign | pending_approval | fee_credit | fee_debit | policy_set | policy_clear | grant_create | token_verifier_change | recovery_wallet_set | owner_unlink
  phygital_token TEXT,
  actor          TEXT,                   -- accessory | owner_device | visitor_device | system
  ok             INTEGER,                -- 1 / 0 / NULL
  session_id     TEXT,                   -- bearer jti (correlation)
  intent_hash    TEXT,                   -- correlation
  detail_json    TEXT                    -- everything event-specific
);

CREATE INDEX IF NOT EXISTS audit_log_token_ts ON audit_log (phygital_token, ts);
CREATE INDEX IF NOT EXISTS audit_log_event_ts ON audit_log (event, ts);
CREATE INDEX IF NOT EXISTS audit_log_session  ON audit_log (session_id);
CREATE INDEX IF NOT EXISTS audit_log_intent   ON audit_log (intent_hash);
