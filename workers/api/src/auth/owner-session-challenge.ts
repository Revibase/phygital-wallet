/**
 * Single-use challenges for owner-session mint (ed25519 prove-possession).
 */
import { createKvChallenge } from "@/shared/kv-challenge";

/** Domain prefix — must match secure-signer `SESSION_CHALLENGE_PREFIX`. */
export const OWNER_SESSION_CHALLENGE_PREFIX =
  "revibase.owner-session.v1" as const;

const kv = createKvChallenge({
  kvPrefix: "owner-session:challenge:",
  ttlSec: 120,
  messagePrefix: OWNER_SESSION_CHALLENGE_PREFIX,
});

export const issueOwnerSessionChallenge = kv.issue;
export const consumeOwnerSessionChallenge = kv.consume;
export const ownerSessionChallengeMessage = kv.challengeMessage;
