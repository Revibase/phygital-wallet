/**
 * Single-use challenges for owner-wallet blob PUT (ed25519 prove-possession).
 */
import { createKvChallenge } from "@/shared/kv-challenge";

/** Domain prefix — must match secure-signer `PUT_CHALLENGE_PREFIX`. */
export const PUT_CHALLENGE_PREFIX = "revibase.owner-wallet.put.v1" as const;

const kv = createKvChallenge({
  kvPrefix: "owner-wallet:put:challenge:",
  ttlSec: 120,
  messagePrefix: PUT_CHALLENGE_PREFIX,
});

export const issuePutChallenge = kv.issue;
export const consumePutChallenge = kv.consume;
export const putChallengeMessage = kv.challengeMessage;
