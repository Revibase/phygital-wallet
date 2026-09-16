/**
 * Single-use WebAuthn challenges for accessory unlock.
 */
import { createKvChallenge } from "@/shared/kv-challenge";

const kv = createKvChallenge({
  kvPrefix: "accessory:unlock:challenge:",
  ttlSec: 60,
});

export const issueUnlockChallenge = kv.issue;
export const consumeUnlockChallenge = kv.consume;
