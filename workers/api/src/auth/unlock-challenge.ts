/**
 * Single-use WebAuthn challenges for accessory unlock.
 *
 * The accessory's phygital token is unknown until the assertion is verified
 * (it is derived from the signed secp256r1 pubkey), so challenges are keyed by
 * an opaque `challengeId` rather than by token. Stored in `revibase_auth_kv`
 * with a short TTL and deleted on consume.
 */
import { bytesToBase64Url } from "@/shared/crypto/base64";
import { getEnv } from "@/shared/request-context";

const CHALLENGE_TTL_SEC = 60;
const CHALLENGE_PREFIX = "accessory:unlock:challenge:";

function challengeKey(challengeId: string): string {
  return `${CHALLENGE_PREFIX}${challengeId}`;
}

/** Mint a fresh challenge. The `challenge` string is the WebAuthn message. */
export async function issueUnlockChallenge(): Promise<{
  challengeId: string;
  challenge: string;
}> {
  const challengeId = crypto.randomUUID();
  const challenge = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  await getEnv().revibase_auth_kv.put(challengeKey(challengeId), challenge, {
    expirationTtl: CHALLENGE_TTL_SEC,
  });
  return { challengeId, challenge };
}

/**
 * Consume a challenge by id, returning the stored message (or null when
 * missing/expired). Single-use: the key is deleted before returning.
 */
export async function consumeUnlockChallenge(
  challengeId: string,
): Promise<string | null> {
  const kv = getEnv().revibase_auth_kv;
  const key = challengeKey(challengeId);
  const stored = await kv.get(key);
  if (!stored) return null;
  await kv.delete(key);
  return stored;
}
