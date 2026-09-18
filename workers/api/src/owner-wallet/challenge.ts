/**
 * Single-use challenges for owner-wallet blob backup (ed25519 prove-possession)
 * and restore (WebAuthn assertion for login).
 *
 * Restore challenges store the **challenge string** (base64url 32 bytes) — the
 * same bytes the authenticator signs. Identity is bound by the assertion
 * (sha256(rawId) → blob row), not by the challenge ticket.
 */
import { createKvChallenge } from "@/shared/kv-challenge";

/** Domain prefix — must match secure-signer `PUT_CHALLENGE_PREFIX`. */
export const PUT_CHALLENGE_PREFIX = "revibase.owner-wallet.put.v1" as const;

const backupKv = createKvChallenge({
  kvPrefix: "owner-wallet:backup:challenge:",
  ttlSec: 120,
  messagePrefix: PUT_CHALLENGE_PREFIX,
});

export const issueBackupChallenge = backupKv.issue;
export const consumeBackupChallenge = backupKv.consume;
export const backupChallengeMessage = backupKv.challengeMessage;

/** Short TTL: issued immediately before the WebAuthn ceremony. */
const restoreKv = createKvChallenge({
  kvPrefix: "owner-wallet:restore:challenge:",
  ttlSec: 60,
});

export const issueRestoreChallenge = restoreKv.issue;

export const consumeRestoreChallenge = restoreKv.consume;
