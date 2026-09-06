import {
  createSolanaRpc,
  fetchEncodedAccounts,
} from "@solana/kit";
import {
  decodeConfig,
  findConfigPda,
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

async function loadDefaultVerifierSet(): Promise<Set<string>> {
  const now = Date.now();
  if (
    cachedDefaultVerifiers &&
    now - cachedDefaultVerifiers.at < CONFIG_CACHE_MS
  ) {
    return cachedDefaultVerifiers.set;
  }

  const rpc = createSolanaRpc(getRpcUrl());
  const [configPda] = await findConfigPda();
  const [encoded] = await fetchEncodedAccounts(rpc, [configPda]);
  const set = verifierSetFromConfig(encoded);
  cachedDefaultVerifiers = { at: now, set };
  return set;
}

/** True when this pubkey is a Config default verifier (paymaster). */
export async function isDefaultConfigVerifier(
  verifier: string,
): Promise<boolean> {
  const defaults = await loadDefaultVerifierSet();
  return defaults.has(verifier);
}
