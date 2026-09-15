/**
 * Single-use challenges for owner-wallet blob PUT (ed25519 prove-possession).
 */
import { bytesToBase64Url } from "@/shared/crypto/base64";
import { getEnv } from "@/shared/request-context";

const CHALLENGE_TTL_SEC = 120;
const CHALLENGE_PREFIX = "owner-wallet:put:challenge:";

function challengeKey(challengeId: string): string {
  return `${CHALLENGE_PREFIX}${challengeId}`;
}

export async function issuePutChallenge(): Promise<{
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

/** Consume challenge bytes (base64url). Null if missing/expired. */
export async function consumePutChallenge(
  challengeId: string,
): Promise<string | null> {
  const kv = getEnv().revibase_auth_kv;
  const key = challengeKey(challengeId);
  const stored = await kv.get(key);
  if (!stored) return null;
  await kv.delete(key);
  return stored;
}

/** Domain-separated message the wallet must sign for PUT. */
export function putChallengeMessage(challengeBytes: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode("revibase.owner-wallet.put.v1");
  const out = new Uint8Array(prefix.length + challengeBytes.length);
  out.set(prefix, 0);
  out.set(challengeBytes, prefix.length);
  return out;
}
