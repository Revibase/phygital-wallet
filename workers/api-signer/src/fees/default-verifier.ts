/**
 * Whether a token uses Config default-verifier paymaster sponsorship.
 * Default set = pubkeys from `VERIFIER_SECRET_KEYS` (no Config RPC).
 * Caches per-token TokenVerifier override (~30s) so hot paths avoid RPC on hit.
 */
import { address, fetchEncodedAccounts } from "@solana/kit";
import { decodeTokenVerifier, findTokenVerifierPda } from "phygital-wallet-sdk";

import { parseVerifierSecretKeyPubkeys } from "@/backend/secrets";
import { getEnv } from "@/shared/request-context";
import { getSolanaRpc } from "@/shared/solana/cluster";

const TOKEN_VERIFIER_CACHE_MS = 30_000;

let cachedDefaults: Set<string> | null = null;

/** token → override verifier pubkey, or null when PDA absent (defaults apply). */
const tokenVerifierCache = new Map<
  string,
  { at: number; override: string | null }
>();

function getDefaultVerifierSet(): Set<string> {
  if (cachedDefaults) return cachedDefaults;
  cachedDefaults = parseVerifierSecretKeyPubkeys(getEnv().VERIFIER_SECRET_KEYS);
  return cachedDefaults;
}

function rememberTokenOverride(
  phygitalToken: string,
  now: number,
  override: string | null,
): string | null {
  if (tokenVerifierCache.size >= 256) {
    const oldest = tokenVerifierCache.keys().next().value;
    if (oldest !== undefined) tokenVerifierCache.delete(oldest);
  }
  tokenVerifierCache.set(phygitalToken, { at: now, override });
  return override;
}

function overrideFromEncoded(
  encoded: Awaited<ReturnType<typeof fetchEncodedAccounts>>[number],
): string | null {
  const tokenVerifier = decodeTokenVerifier(encoded);
  return tokenVerifier.exists ? String(tokenVerifier.data.verifier) : null;
}

async function fetchTokenOverride(phygitalToken: string): Promise<string | null> {
  const now = Date.now();
  const tvEntry = tokenVerifierCache.get(phygitalToken);
  if (tvEntry != null && now - tvEntry.at < TOKEN_VERIFIER_CACHE_MS) {
    return tvEntry.override;
  }
  const rpc = getSolanaRpc();
  const token = address(phygitalToken);
  const [tokenVerifierPda] = await findTokenVerifierPda({ phygitalToken: token });
  const [tvEncoded] = await fetchEncodedAccounts(rpc, [tokenVerifierPda]);
  return rememberTokenOverride(
    phygitalToken,
    now,
    overrideFromEncoded(tvEncoded),
  );
}

/** True when this pubkey is in the default verifier set (from secret keys). */
export async function isDefaultConfigVerifier(
  verifier: string,
): Promise<boolean> {
  return getDefaultVerifierSet().has(verifier);
}

/**
 * Whether the wire verifier is a default key, and whether this token uses
 * default-verifier paymaster (TokenVerifier override RPC when cold).
 */
export async function resolveVerifierFeeContext(args: {
  phygitalToken: string;
  verifier: string;
}): Promise<{ isConfigDefault: boolean; usesDefaultPaymaster: boolean }> {
  const defaults = getDefaultVerifierSet();
  const override = await fetchTokenOverride(args.phygitalToken);
  return {
    isConfigDefault: defaults.has(args.verifier),
    usesDefaultPaymaster: override == null || defaults.has(override),
  };
}

/** True when this token uses a default verifier (no exclusive override). */
export async function usesDefaultVerifierPaymaster(
  phygitalToken: string,
): Promise<boolean> {
  const defaults = getDefaultVerifierSet();
  const override = await fetchTokenOverride(phygitalToken);
  return override == null || defaults.has(override);
}
