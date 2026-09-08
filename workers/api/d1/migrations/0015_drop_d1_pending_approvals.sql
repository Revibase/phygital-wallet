-- Soft-deny inbox moved to TokenSigner DO SQLite (per-token).
DROP INDEX IF EXISTS pending_approvals_token_intent_open;
DROP INDEX IF EXISTS pending_approvals_token_open;
DROP TABLE IF EXISTS pending_approvals;
