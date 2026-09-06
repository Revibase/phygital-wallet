/**
 * Whether a token uses Config default-verifier paymaster sponsorship.
 * Caches Config verifier set (~60s) and per-token TokenVerifier override (~8s)
 * so hot preview/sign paths avoid Solana RPC on cache hit.
 */
import { address, fetchEncodedAccounts, type Address } from "@solana/kit";
import {
  decodeConfig,
  decodeTokenVerifier,
  findConfigPda,
  findTokenVerifierPda,
} from "phygital-wallet-sdk";

import { getSolanaRpc } from "@/shared/solana/cluster";

const CONFIG_CACHE_MS = 60_000;
const TOKEN_VERIFIER_CACHE_MS = 8_000;

let cachedDefaults: { at: number; set: Set<string> } | null = null;
let cachedConfigPda: Address | null = null;

/** token → override verifier pubkey, or null when PDA absent (defaults apply). */
const tokenVerifierCache = new Map<
  string,
  { at: number; override: string | null }
>();

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

async function resolveConfigPda(): Promise<Address> {
  if (cachedConfigPda) return cachedConfigPda;
  const [pda] = await findConfigPda();
  cachedConfigPda = pda;
  return pda;
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

/** True when this token is sponsored by a Config default verifier (paymaster). */
export async function usesDefaultVerifierPaymaster(
  phygitalToken: string,
): Promise<boolean> {
  const now = Date.now();
  const defaultsWarm =
    cachedDefaults != null && now - cachedDefaults.at < CONFIG_CACHE_MS;
  const tvEntry = tokenVerifierCache.get(phygitalToken);
  const tvWarm =
    tvEntry != null && now - tvEntry.at < TOKEN_VERIFIER_CACHE_MS;

  if (defaultsWarm && tvWarm) {
    const override = tvEntry!.override;
    return override == null || cachedDefaults!.set.has(override);
  }

  const rpc = getSolanaRpc();
  const token = address(phygitalToken);

  // Both cold: one multi-get.
  if (!defaultsWarm && !tvWarm) {
    const [configPda, [tokenVerifierPda]] = await Promise.all([
      resolveConfigPda(),
      findTokenVerifierPda({ phygitalToken: token }),
    ]);
    const [configEncoded, tvEncoded] = await fetchEncodedAccounts(rpc, [
      configPda,
      tokenVerifierPda,
    ]);
    const set = verifierSetFromConfig(configEncoded);
    cachedDefaults = { at: now, set };
    const override = rememberTokenOverride(
      phygitalToken,
      now,
      overrideFromEncoded(tvEncoded),
    );
    return override == null || set.has(override);
  }

  // One warm, one cold: fetch only what's missing (parallel when both needed).
  let set = cachedDefaults?.set;
  let override = tvWarm ? tvEntry!.override : undefined;

  const fetches: Promise<void>[] = [];
  if (!defaultsWarm) {
    fetches.push(
      (async () => {
        const [encoded] = await fetchEncodedAccounts(rpc, [
          await resolveConfigPda(),
        ]);
        set = verifierSetFromConfig(encoded);
        cachedDefaults = { at: now, set };
      })(),
    );
  }
  if (!tvWarm) {
    fetches.push(
      (async () => {
        const [tokenVerifierPda] = await findTokenVerifierPda({
          phygitalToken: token,
        });
        const [tvEncoded] = await fetchEncodedAccounts(rpc, [tokenVerifierPda]);
        override = rememberTokenOverride(
          phygitalToken,
          now,
          overrideFromEncoded(tvEncoded),
        );
      })(),
    );
  }
  if (fetches.length) await Promise.all(fetches);

  const defaults = set ?? cachedDefaults!.set;
  const ov = override !== undefined ? override : tvEntry!.override;
  return ov == null || defaults.has(ov);
}
