/**
 * Default verifier set = pubkeys from `VERIFIER_SECRET_KEYS` (no chain RPC).
 */
import { parseVerifierSecretKeyPubkeys } from "@/backend/secrets";
import { getEnv } from "@/shared/request-context";

let cachedDefaults: Set<string> | null = null;

function getDefaultVerifierSet(): Set<string> {
  if (cachedDefaults) return cachedDefaults;
  cachedDefaults = parseVerifierSecretKeyPubkeys(getEnv().VERIFIER_SECRET_KEYS);
  return cachedDefaults;
}

/** True when this pubkey is in the default verifier set (from secret keys). */
export async function isDefaultConfigVerifier(
  verifier: string
): Promise<boolean> {
  return getDefaultVerifierSet().has(verifier);
}

export function getRandomVerifier(): string {
  const verifiers = [...getDefaultVerifierSet()];
  const verifier = verifiers[Math.floor(Math.random() * verifiers.length)];
  if (!verifier) {
    throw new Error("No verifiers in default config");
  }
  return verifier;
}
