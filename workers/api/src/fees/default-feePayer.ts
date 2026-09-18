/**
 * Default fee-payer pubkeys from `DEFAULT_FEE_PAYER_PUBKEYS`.
 * Must match api-signer `FEE_PAYER_SECRET_KEYS` keys.
 */
import { coded } from "@/shared/errors";
import { getEnv } from "@/shared/request-context";

let cached: Set<string> | null = null;

function parseFeePayerPubkeys(raw: string | undefined): Set<string> {
  if (!raw?.trim()) {
    throw coded("DEFAULT_FEE_PAYER_PUBKEYS is not configured", "fee_misconfigured");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw coded("DEFAULT_FEE_PAYER_PUBKEYS must be valid JSON", "fee_misconfigured");
  }
  if (!Array.isArray(parsed)) {
    throw coded(
      "DEFAULT_FEE_PAYER_PUBKEYS must be a JSON array of base58 pubkeys",
      "fee_misconfigured",
    );
  }
  const set = new Set<string>();
  for (const item of parsed) {
    if (typeof item !== "string" || !item.trim()) {
      throw coded(
        "DEFAULT_FEE_PAYER_PUBKEYS entries must be non-empty strings",
        "fee_misconfigured",
      );
    }
    set.add(item.trim());
  }
  if (set.size === 0) {
    throw coded(
      "DEFAULT_FEE_PAYER_PUBKEYS must include at least one pubkey",
      "fee_misconfigured",
    );
  }
  return set;
}

export function getFeePayerSet(): Set<string> {
  if (cached) return cached;
  cached = parseFeePayerPubkeys(getEnv().DEFAULT_FEE_PAYER_PUBKEYS);
  return cached;
}

export async function isDefaultFeePayer(feePayer: string): Promise<boolean> {
  return getFeePayerSet().has(feePayer);
}
