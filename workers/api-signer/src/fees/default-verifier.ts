import {
  address,
  createSolanaRpc,
  fetchEncodedAccounts,
} from "@solana/kit";
import {
  decodeConfig,
  decodeTokenVerifier,
  findConfigPda,
  findTokenVerifierPda,
} from "phygital-wallet-sdk";

import { getRpcUrl } from "@/shared/solana/cluster";

let cachedDefaultVerifiers: { at: number; set: Set<string> } | null = null;
const CONFIG_CACHE_MS = 60_000;

function verifierSetFromConfig(
  encoded: Awaited<ReturnType<typeof fetchEncodedAccounts>>[number],
): Set<string> {
  const config = decodeConfig(encoded);
  const set = new Set<string>();
  if (config.exists) {
    const count = config.data.verifierCount;
    for (let i = 0; i < count; i++) {
      const v = config.data.verifiers[i];
      if (v) set.add(String(v));
    }
  }
  return set;
}

/** True when this token is sponsored by a Config default verifier (paymaster). */
export async function usesDefaultVerifierPaymaster(
  phygitalToken: string,
): Promise<boolean> {
  const rpc = createSolanaRpc(getRpcUrl());
  const token = address(phygitalToken);
  const [[configPda], [tokenVerifierPda]] = await Promise.all([
    findConfigPda(),
    findTokenVerifierPda({ phygitalToken: token }),
  ]);

  const now = Date.now();
  const cacheHit =
    cachedDefaultVerifiers &&
    now - cachedDefaultVerifiers.at < CONFIG_CACHE_MS;

  if (cacheHit) {
    const [tvEncoded] = await fetchEncodedAccounts(rpc, [tokenVerifierPda]);
    const tokenVerifier = decodeTokenVerifier(tvEncoded);
    if (!tokenVerifier.exists) return true;
    return cachedDefaultVerifiers!.set.has(String(tokenVerifier.data.verifier));
  }

  // One multi-get: Config + TokenVerifier.
  const [configEncoded, tvEncoded] = await fetchEncodedAccounts(rpc, [
    configPda,
    tokenVerifierPda,
  ]);
  const defaults = verifierSetFromConfig(configEncoded);
  cachedDefaultVerifiers = { at: now, set: defaults };

  const tokenVerifier = decodeTokenVerifier(tvEncoded);
  if (!tokenVerifier.exists) return true;
  return defaults.has(String(tokenVerifier.data.verifier));
}
