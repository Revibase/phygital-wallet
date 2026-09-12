import {
  type Address,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionPartialSigner,
} from "@solana/kit";
import {
  PolicyDeniedError,
  previewWalletIntent,
  resolveVerifier,
} from "phygital-wallet-sdk";

import { getApiBaseUrl } from "@/lib/api-base";
import { queryFetch } from "@/lib/queries/http";
import {
  buildUnsignedTransaction,
  signAndSendTransaction,
  type SentTransaction,
} from "@/lib/solana/tx";
import { accessTokenFor } from "@/lib/wallet/verifier-session";

const DEFAULT_VERIFIER_API_ORIGIN = "https://api.revibase.com";

/**
 * App fetch for verifier `/preview` + `/sign`.
 *
 * The rewrite maps the SDK's default Revibase origin onto this app's configured
 * API base (so local/staging work); it is **not** how these calls authenticate —
 * both endpoints are bearer-only, and the bearer is attached by the SDK via
 * `getAccessToken`. Cookies still ride along for Revibase app routes.
 */
export function appVerifierFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : String(input);
  const rewritten = raw.startsWith(DEFAULT_VERIFIER_API_ORIGIN)
    ? `${getApiBaseUrl()}${raw.slice(DEFAULT_VERIFIER_API_ORIGIN.length)}`
    : raw;
  return queryFetch(rewritten, init);
}

export type AppVerifierSigner = TransactionPartialSigner & {
  /** Token this signer co-signs for. */
  phygitalToken: string;
  /** Verifier API base for `/preview` + `/sign`. */
  endpoint: string;
};

/**
 * Single HTTP verifier signer used as fee payer **and** instruction `payer` /
 * `verifier` for set/clear token verifier and recovery wallet.
 */
export async function createAppVerifierSigner(
  rpc: Rpc<SolanaRpcApi>,
  phygitalToken: Address
): Promise<AppVerifierSigner> {
  const resolved = await resolveVerifier(rpc, phygitalToken, {
    getAccessToken: accessTokenFor(String(phygitalToken)),
    fetch: appVerifierFetch,
  });

  return {
    address: resolved.verifier.address,
    phygitalToken: String(phygitalToken),
    endpoint: resolved.endpoint,
    signTransactions: (transactions, options) =>
      resolved.verifier.signTransactions(transactions, options),
  };
}

/**
 * Preview a config change and return the intent hash the owner must grant.
 *
 * `previewInstruction` is a **proof-less** config instruction (placeholder
 * Secp256r1 args / slot) — the server hashes only the canonical intent (action
 * + new verifier / endpoint / recovery wallet), so this hash equals the one the
 * real, signed instruction produces later. Config always soft-denies, so a soft
 * `PolicyDeniedError` carrying `intentHash` is the success path; a hard denial
 * (fee / origin / invalid) rethrows.
 *
 * This runs the execute order exactly: preview first, sign nothing yet.
 */
export async function previewConfigIntent(
  signer: AppVerifierSigner,
  previewInstruction: Instruction
): Promise<string> {
  try {
    await previewWalletIntent({
      instructions: [previewInstruction],
      endpoint: signer.endpoint,
      fetch: appVerifierFetch,
      getAccessToken: accessTokenFor(signer.phygitalToken),
    });
  } catch (e) {
    if (e instanceof PolicyDeniedError && e.soft && e.intentHash) {
      return e.intentHash;
    }
    throw e;
  }
  throw new Error("Settings change was not gated for approval");
}

/**
 * Build and broadcast the final, proof-carrying config tx. Call this **after**
 * the owner has granted the intent (see {@link previewConfigIntent} +
 * `createOneTimeGrant`) and the accessory has been tapped to produce the
 * Secp256r1 proof in `instructions`. `/sign` consumes the grant and co-signs.
 */
export async function sendConfigTransaction(args: {
  instructions: Instruction[];
  signer: AppVerifierSigner;
}): Promise<SentTransaction> {
  const unsigned = await buildUnsignedTransaction({
    instructions: args.instructions,
    feePayer: args.signer,
  });
  return signAndSendTransaction(unsigned);
}
