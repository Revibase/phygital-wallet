-- Self-indexed wallet activity, replacing the Helius wallet-activities API.
--
-- The helius-wallet-service (Railway) streams every transaction touching a
-- watched wallet to POST /webhooks/transactions. That endpoint enqueues the raw
-- Helius `transactionSubscribe` result onto the WALLET_TX_QUEUE; the queue
-- consumer parses it into the same readable rows the app renders for wallet
-- activity (see app `WalletActivityItem`) and upserts them here.
--
-- One transaction can touch several wallets (sender, recipient, token owners),
-- so a single tx produces one row per affected wallet. Rows are keyed by
-- (wallet_address, signature) and inserted idempotently: the service retries
-- indefinitely and the queue redelivers, so re-ingesting the same tx is a no-op.
--
-- deltas_json holds the per-mint balance changes for that wallet:
--   [{ "mint": "...", "direction": "in" | "out", "amountUi": "12.34" }]
-- block_time is unix seconds; it always resolves to the tx block time when
-- present, otherwise the webhook receivedAt, so it is safe to sort/paginate on.
--
-- Forward compatibility (mirrors the `audit_log` design): only fields we
-- sort/filter on are first-class columns. Richer parsed detail — tx category,
-- counterparties, program ids, swap legs, a human-readable description — lives
-- in detail_json, so new parsers add fields without a schema migration.
-- parser_version records which parser wrote the row: when a richer parser ships
-- we bump the code constant and backfill rows below it, re-parsing in place.

CREATE TABLE IF NOT EXISTS wallet_activity (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT    NOT NULL,
  signature      TEXT    NOT NULL,
  slot           INTEGER,
  block_time     INTEGER NOT NULL,       -- unix seconds (blockTime | receivedAt)
  kind           TEXT    NOT NULL,       -- sent | received | approved | topUp | failed | other
  title          TEXT    NOT NULL,
  amount_label   TEXT,
  status_label   TEXT,
  mint           TEXT,                    -- primary delta mint
  deltas_json    TEXT    NOT NULL,        -- JSON array of balance deltas
  failed         INTEGER NOT NULL DEFAULT 0,
  detail_json    TEXT,                    -- extensible structured detail (nullable)
  parser_version INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL         -- Date.now() at ingest
);

-- Backfill support: find rows written by an older parser to re-parse in place.
CREATE INDEX IF NOT EXISTS wallet_activity_parser_version
  ON wallet_activity (parser_version);

-- Idempotency: one row per (wallet, tx). INSERT OR IGNORE relies on this.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_activity_wallet_sig
  ON wallet_activity (wallet_address, signature);

-- Keyset pagination: newest first per wallet, tie-broken by insertion id.
CREATE INDEX IF NOT EXISTS wallet_activity_wallet_time
  ON wallet_activity (wallet_address, block_time DESC, id DESC);
