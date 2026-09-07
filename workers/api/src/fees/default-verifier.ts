/**
 * Default verifier / paymaster set for fee webhook sponsorship checks.
 * Membership comes from `DEFAULT_VERIFIER_PUBKEYS` (JSON array of base58
 * pubkeys) — must match the keys of api-signer `VERIFIER_SECRET_KEYS`.
 * No on-chain Config RPC.
 */
import { getEnv } from "@/shared/request-context";

let cached: Set<string> | null = null;

function parseDefaultVerifierPubkeys(raw: string | undefined): Set<string> {
  if (!raw?.trim()) {
    throw Object.assign(
      new Error("DEFAULT_VERIFIER_PUBKEYS is not configured"),
      { code: "fee_misconfigured" },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Object.assign(
      new Error("DEFAULT_VERIFIER_PUBKEYS must be valid JSON"),
      { code: "fee_misconfigured" },
    );
  }
  if (!Array.isArray(parsed)) {
    throw Object.assign(
      new Error("DEFAULT_VERIFIER_PUBKEYS must be a JSON array of base58 pubkeys"),
      { code: "fee_misconfigured" },
    );
  }
  const set = new Set<string>();
  for (const item of parsed) {
    if (typeof item !== "string" || !item.trim()) {
      throw Object.assign(
        new Error("DEFAULT_VERIFIER_PUBKEYS entries must be non-empty strings"),
        { code: "fee_misconfigured" },
      );
    }
    set.add(item.trim());
  }
  if (set.size === 0) {
    throw Object.assign(
      new Error("DEFAULT_VERIFIER_PUBKEYS must include at least one pubkey"),
      { code: "fee_misconfigured" },
    );
  }
  return set;
}

function getDefaultVerifierSet(): Set<string> {
  if (cached) return cached;
  cached = parseDefaultVerifierPubkeys(getEnv().DEFAULT_VERIFIER_PUBKEYS);
  return cached;
}

/** True when this pubkey is a default verifier (paymaster). */
export async function isDefaultConfigVerifier(
  verifier: string,
): Promise<boolean> {
  return getDefaultVerifierSet().has(verifier);
}
