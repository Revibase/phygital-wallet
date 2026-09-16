/**
 * Centralized, security-critical constants for the signer.
 *
 * WHY a single obvious file (§41): every value that defines the trust boundary
 * — the parent origin we accept, the fixed crypto parameters a swapped wallet
 * blob must NOT be able to steer (§35), the allowed programs, and the hard size
 * caps applied BEFORE any expensive parsing (§32) — lives here so it can be
 * audited at a glance. Nothing here is attacker-controllable.
 */

/** postMessage protocol version. Requests with any other value fail closed. */
export const PROTOCOL_VERSION = 1 as const;

/**
 * The ONLY origin we accept postMessage requests from, and the only origin we
 * post results to. Never `"*"` (§9). Set at build time via VITE_PARENT_ORIGIN.
 *
 * NOTE (§2): matching this origin does NOT prove a request is benign — an XSS
 * attacker running on the legitimate parent has the legitimate origin. It is a
 * necessary filter, not the authorization mechanism.
 */
export const EXPECTED_PARENT_ORIGIN: string =
  (import.meta.env?.VITE_PARENT_ORIGIN as string | undefined) ??
  "http://localhost:3000";

/**
 * Shared WebAuthn RP ID with the parent app. Create runs on the app origin;
 * get+PRF runs in this iframe. Must match `NEXT_PUBLIC_WEBAUTHN_RP_ID`.
 */
export function resolveRpId(hostname: string, envRpId?: string): string {
  const fromEnv = envRpId?.trim();
  if (fromEnv) return fromEnv;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "localhost";
  if (hostname === "revibase.com" || hostname.endsWith(".revibase.com")) {
    return "revibase.com";
  }
  return hostname;
}

export const RP_ID: string = resolveRpId(
  typeof globalThis !== "undefined" && "location" in globalThis
    ? (globalThis as { location?: { hostname: string } }).location?.hostname ??
        "localhost"
    : "localhost",
  import.meta.env?.VITE_RP_ID as string | undefined
);

// ---------------------------------------------------------------------------
// Fixed cryptographic parameters (IMPLEMENTATION-FIXED, never from the blob).
// A portable wallet blob authenticates these via AAD but does NOT carry them,
// so a malicious parent cannot swap in a different PRF input / KDF / algorithm
// to coax unexpected decryption behavior (§7, §35).
// ---------------------------------------------------------------------------

/** WebAuthn PRF eval input. Hashed to 32 bytes at use; constant across all wallets. */
export const PRF_INPUT_LABEL = "secure-signer:prf:v1" as const;
/** HKDF-SHA256 `info` binding the derived key to this application + purpose. */
export const HKDF_INFO_LABEL = "secure-signer:wrap:v1" as const;
/** HKDF output / AES key length in bits. */
export const AES_KEY_BITS = 256 as const;
/** AES-GCM IV length in bytes (96-bit, the GCM standard). */
export const AES_GCM_IV_BYTES = 12 as const;
/** AES-GCM authentication tag length in bits. */
export const AES_GCM_TAG_BITS = 128 as const;
/** Ed25519 private seed length in bytes. */
export const ED25519_SEED_BYTES = 32 as const;
/** Ed25519 public key length in bytes. */
export const ED25519_PUBKEY_BYTES = 32 as const;
/** HKDF salt length used inside the blob (random per wallet). */
export const KDF_SALT_BYTES = 32 as const;

/**
 * Domain prefix for ed25519 messages proving possession for D1 blob PUT
 * (and owner_session mint on the same PUT).
 * Must match workers/api `putChallengeMessage`.
 */
export const PUT_CHALLENGE_PREFIX = "revibase.owner-wallet.put.v1" as const;

// ---------------------------------------------------------------------------
// Portable wallet blob format.
// ---------------------------------------------------------------------------

/** Magic prefix identifying our binary blob. ASCII "SSW1". */
export const BLOB_MAGIC = Uint8Array.from([0x53, 0x53, 0x57, 0x31]); // "SSW1"
/** Only supported blob version. Unknown versions fail closed (§6). */
export const BLOB_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Hard size caps — applied BEFORE parsing (§32). Values are deliberately tight.
// ---------------------------------------------------------------------------

/** Max total size of an inbound postMessage payload (JSON string bytes). */
export const MAX_MESSAGE_BYTES = 16 * 1024;
/** Max encoded wallet-blob size. A blob is fixed-shape + small credentialId. */
export const MAX_BLOB_BYTES = 1024;
/** Max WebAuthn credential id length (spec allows up to 1023; we cap tighter). */
export const MAX_CREDENTIAL_ID_BYTES = 256;
/** Max serialized transaction size. Solana v1 message limit is 4096 bytes. */
export const MAX_TX_BYTES = 4096;

// ---------------------------------------------------------------------------
// Freshness / replay.
// ---------------------------------------------------------------------------

/** Requests older than this (by client `timestamp`) are rejected as stale (§9). */
export const REQUEST_FRESHNESS_WINDOW_MS = 60_000;
/** Remembered request ids for duplicate detection. Bounded to avoid growth. */
export const SEEN_REQUEST_IDS_LIMIT = 512;
/** How long AUTH_START waits for BLOB_PROVIDED after BLOB_NEEDED. */
export const AUTH_BLOB_WAIT_MS = 60_000;
/** Brief authenticated confirmation before the parent may hide the overlay. */
export const AUTH_SUCCESS_MS = 700;
