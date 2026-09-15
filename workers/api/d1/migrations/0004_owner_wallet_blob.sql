-- Portable encrypted owner-wallet blob (secure-signer SSW1 ciphertext).
--
-- The row is PUBLIC CIPHERTEXT: holding it does not reveal the ed25519 seed.
-- Lookup key is sha256(credentialId) hex so a discoverable WebAuthn assertion
-- can restore the blob on a new device without a server-side session.
--
-- Upserts refuse to replace an existing row with a different public_key
-- (same credentialId must stay bound to one wallet).

CREATE TABLE IF NOT EXISTS owner_wallet_blob (
  credential_id_hash TEXT    PRIMARY KEY,
  public_key         TEXT    NOT NULL,
  encrypted_blob     TEXT    NOT NULL,
  blob_version       INTEGER NOT NULL DEFAULT 1,
  updated_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS owner_wallet_blob_pubkey
  ON owner_wallet_blob (public_key);
