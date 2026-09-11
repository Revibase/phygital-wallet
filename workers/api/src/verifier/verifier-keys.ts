/**
 * On-chain verifier resolution + caches for the hot connect paths.
 *
 * `/preview` and `/sign` do NOT use this — they verify a bearer's `iss` against
 * our own key set locally (see `require-bearer.ts`). Only `/connect` and
 * `/connect/tap` read chain here, to gate bearer minting on the token actually
 * being configured to a verifier key we hold.
 */
import {
  createSolanaRpc,
  fetchEncodedAccounts,
  getBase58Encoder,
  type Address,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import {
  activeConfigVerifierAddresses,
  decodeConfig,
  decodeTokenVerifier,
  findConfigPda,
  findTokenVerifierPda,
} from "phygital-wallet-sdk";
import {
  fetchPhygitalTokenByIdentifier,
  findPhygitalTokenPda,
} from "phygital-token-sdk";
import type { DecodeVerifierKey } from "phygital-verifier-sdk";

import { getRpcUrl } from "@/shared/solana/cluster";

const base58Encoder = getBase58Encoder();

/** One Kit RPC client per isolate — building it each call wastes CPU. */
let rpcClient: { url: string; rpc: Rpc<SolanaRpcApi> } | null = null;
export function createRpc(): Rpc<SolanaRpcApi> {
  const url = getRpcUrl();
  if (rpcClient?.url === url) return rpcClient.rpc;
  const rpc = createSolanaRpc(url);
  rpcClient = { url, rpc };
  return rpc;
}

/**
 * Per-token authorized verifier set. Only non-empty results are cached (so a
 * token configured moments ago is not locked out by a cached empty set), and
 * only long enough that a verifier repoint still takes effect well inside a
 * 15-min session. On-chain authorization is re-enforced by the program at
 * execute, so a briefly-stale positive is harmless.
 */
const AUTHORIZED_TTL_MS = 120_000;
const authorizedCache = new Map<
  string,
  { verifiers: Set<string>; expiresAt: number }
>();

export async function resolveAuthorizedVerifiers(
  rpc: Rpc<SolanaRpcApi>,
  phygitalToken: Address,
): Promise<Set<string>> {
  const key = String(phygitalToken);
  const cached = authorizedCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.verifiers;

  const [[tokenVerifierPda], [configPda]] = await Promise.all([
    findTokenVerifierPda({ phygitalToken }),
    findConfigPda(),
  ]);

  const [tokenVerifierEncoded, configEncoded] = await fetchEncodedAccounts(
    rpc,
    [tokenVerifierPda, configPda],
  );

  const tokenVerifier = decodeTokenVerifier(tokenVerifierEncoded);
  let verifiers: Set<string>;
  if (tokenVerifier.exists) {
    // An override is exclusive: only this verifier may act for the token.
    verifiers = new Set([String(tokenVerifier.data.verifier)]);
  } else {
    const config = decodeConfig(configEncoded);
    verifiers = config.exists
      ? activeConfigVerifierAddresses(config.data)
      : new Set<string>();
  }

  if (verifiers.size > 0) {
    authorizedCache.set(key, {
      verifiers,
      expiresAt: Date.now() + AUTHORIZED_TTL_MS,
    });
  }
  return verifiers;
}

/**
 * Chip identifier → token PDA. This mapping is immutable once a token is minted,
 * so it is cached for the life of the isolate — turning the `getProgramAccounts`
 * scan on `/connect/tap` into a one-time cost per chip per isolate. Bounded so a
 * long-lived isolate cannot grow it without limit.
 *
 * For fleet-wide hit rate at scale, front this with a colo-shared `caches.default`
 * entry (immutable, long max-age) so cold isolates also skip the scan.
 */
const MAX_CHIP_CACHE = 50_000;
const tokenByChip = new Map<string, string>();

export async function resolveTokenFromIdentifier(
  rpc: Rpc<SolanaRpcApi>,
  identifier: string,
): Promise<Address | null> {
  const hit = tokenByChip.get(identifier);
  if (hit) return hit as Address;

  const account = await fetchPhygitalTokenByIdentifier(rpc, identifier);
  if (!account) return null;
  const token = String(await findPhygitalTokenPda(account.publicKey));

  if (tokenByChip.size >= MAX_CHIP_CACHE) tokenByChip.clear();
  tokenByChip.set(identifier, token);
  return token as Address;
}

/**
 * Pure base58 address → Ed25519 public key. Runs before the signature check, so
 * it must not touch the network.
 */
export const decodeVerifierKey: DecodeVerifierKey = (iss) => {
  try {
    const bytes = new Uint8Array(base58Encoder.encode(iss));
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
};
