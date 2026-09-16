/**
 * Single-use KV challenges (opaque id → base64url bytes).
 */
import { bytesToBase64Url } from "@/shared/crypto/base64";
import { getEnv } from "@/shared/request-context";

export function createKvChallenge(opts: {
  kvPrefix: string;
  ttlSec: number;
  /** When set, `challengeMessage` domain-separates the raw challenge bytes. */
  messagePrefix?: string;
}) {
  const { kvPrefix, ttlSec, messagePrefix } = opts;

  function challengeKey(challengeId: string): string {
    return `${kvPrefix}${challengeId}`;
  }

  async function issue(): Promise<{ challengeId: string; challenge: string }> {
    const challengeId = crypto.randomUUID();
    const challenge = bytesToBase64Url(
      crypto.getRandomValues(new Uint8Array(32)),
    );
    await getEnv().revibase_auth_kv.put(challengeKey(challengeId), challenge, {
      expirationTtl: ttlSec,
    });
    return { challengeId, challenge };
  }

  /** Consume challenge bytes (base64url). Null if missing/expired. */
  async function consume(challengeId: string): Promise<string | null> {
    const kv = getEnv().revibase_auth_kv;
    const key = challengeKey(challengeId);
    const stored = await kv.get(key);
    if (!stored) return null;
    await kv.delete(key);
    return stored;
  }

  function challengeMessage(challengeBytes: Uint8Array): Uint8Array {
    if (!messagePrefix) {
      throw new Error("challengeMessage requires messagePrefix");
    }
    const prefix = new TextEncoder().encode(messagePrefix);
    const out = new Uint8Array(prefix.length + challengeBytes.length);
    out.set(prefix, 0);
    out.set(challengeBytes, prefix.length);
    return out;
  }

  return { issue, consume, challengeMessage };
}
