-- Policy + fee ledgers moved to TokenSigner Durable Object SQLite.
DROP INDEX IF EXISTS one_time_grants_token_intent_unconsumed;
DROP TABLE IF EXISTS one_time_grants;
DROP TABLE IF EXISTS token_policies;

DROP INDEX IF EXISTS fee_balance_events_token_idx;
DROP TABLE IF EXISTS fee_balance_events;
DROP TABLE IF EXISTS token_fee_balances;
