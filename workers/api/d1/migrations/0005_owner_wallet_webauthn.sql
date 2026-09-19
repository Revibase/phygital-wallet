-- WebAuthn COSE public key for gated blob restore.
--
-- On discoverable unlock the client presents a WebAuthn assertion; the API
-- verifies it against webauthn_public_key before returning ciphertext.
-- Fresh short-TTL fetch challenges provide replay protection (no signature
-- counter). Create/restore require a non-null COSE key.

ALTER TABLE owner_wallet_blob ADD COLUMN webauthn_public_key TEXT;
