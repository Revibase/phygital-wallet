/**
 * Default fee-payer pubkey set for webhook sponsorship checks.
 * Membership comes from `DEFAULT_VERIFIER_PUBKEYS` (JSON array of base58
 * pubkeys) — must match the keys of api-signer `VERIFIER_SECRET_KEYS`.
 * No on-chain Config RPC.
 */
import { coded } from "@/shared/errors";
import { getEnv } from "@/shared/request-context";

let cached: Set<string> | null = null;

function parseFeePayerPubkeys(raw: string | undefined): Set<string> {
  if (!raw?.trim()) {
    throw coded("DEFAULT_VERIFIER_PUBKEYS is not configured", "fee_misconfigured");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw coded("DEFAULT_VERIFIER_PUBKEYS must be valid JSON", "fee_misconfigured");
  }
  if (!Array.isArray(parsed)) {
    throw coded(
      "DEFAULT_VERIFIER_PUBKEYS must be a JSON array of base58 pubkeys",
      "fee_misconfigured",
    );
  }
  const set = new Set<string>();
  for (const item of parsed) {
    if (typeof item !== "string" || !item.trim()) {
      throw coded(
        "DEFAULT_VERIFIER_PUBKEYS entries must be non-empty strings",
        "fee_misconfigured",
      );
    }
    set.add(item.trim());
  }
  if (set.size === 0) {
    throw coded(
      "DEFAULT_VERIFIER_PUBKEYS must include at least one pubkey",
      "fee_misconfigured",
    );
  }
  return set;
}

export function getFeePayerSet(): Set<string> {
  if (cached) return cached;
  cached = parseFeePayerPubkeys(getEnv().DEFAULT_VERIFIER_PUBKEYS);
  return cached;
}

/** True when this pubkey is a configured default fee payer. */
export async function isDefaultFeePayer(feePayer: string): Promise<boolean> {
  return getFeePayerSet().has(feePayer);
}
