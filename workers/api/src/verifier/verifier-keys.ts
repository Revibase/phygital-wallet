/**
 * Which verifier keys a token authorizes, read from chain.
 *
 * A `TokenVerifier` override names exactly one verifier; otherwise the token
 * accepts **any** active `Config.verifiers` entry (and `resolveVerifier` picks
 * one at random), so bearer validation is a membership test, never equality
 * against a single address.
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
import type { DecodeVerifierKey, IsAuthorizedVerifier } from "phygital-verifier-sdk";

import { getRpcUrl } from "@/shared/solana/cluster";

const base58Encoder = getBase58Encoder();

/**
 * Short-lived cache of each token's authorized verifier set. These accounts only
 * change on an explicit on-chain mutation, and `/connect`, `/auth/app-session`,
 * `/preview` and `/sign` all ask the same question within one user action — so
 * without this a single tap-and-send costs four identical account fetches.
 *
 * The TTL is far shorter than a session (15 min), so repointing a token's
 * verifier still takes effect well within one session's life.
 */
const AUTHORIZED_TTL_MS = 30_000;
const authorizedCache = new Map<
  string,
  { verifiers: Set<string>; expiresAt: number }
>();

export function createRpc(): Rpc<SolanaRpcApi> {
  return createSolanaRpc(getRpcUrl());
}

/** Verifier addresses this token authorizes (override wins, else Config defaults). */
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

  authorizedCache.set(key, {
    verifiers,
    expiresAt: Date.now() + AUTHORIZED_TTL_MS,
  });
  return verifiers;
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

/** On-chain membership test, run only once a bearer's signature has verified. */
export function createAuthorizedVerifierCheck(
  rpc: Rpc<SolanaRpcApi>,
): IsAuthorizedVerifier {
  return async ({ sub, iss }) => {
    try {
      return (await resolveAuthorizedVerifiers(rpc, sub as Address)).has(iss);
    } catch {
      return false;
    }
  };
}
