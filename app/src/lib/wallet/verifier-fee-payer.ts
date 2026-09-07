import {
  type Address,
  type Rpc,
  type SolanaRpcApi,
  type Transaction,
  type TransactionPartialSigner,
  type TransactionWithLifetime,
  type TransactionWithinSizeLimit,
} from "@solana/kit";
import {
  createVerifierEndpointSigner,
  resolveVerifier,
  verifierSignUrl,
} from "phygital-wallet-sdk";

import { getApiBaseUrl } from "@/lib/api-base";
import { bytesToBase64Url } from "@/lib/crypto/base64";
import { queryFetch } from "@/lib/queries/http";
import { assertPolicyMutation } from "@/lib/wallet/policies-client";

const DEFAULT_VERIFIER_API_ORIGIN = "https://api.revibase.com";

type SignableTransaction = Transaction &
  TransactionWithinSizeLimit &
  TransactionWithLifetime;

/**
 * App fetch for verifier `/preview` + `/sign`.
 * Sends cookies and rewrites the default Revibase origin to this app's API base.
 */
export function appVerifierFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
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
  /** True when `/sign` needs owner `cosignConfig` WebAuthn (Config default key). */
  requiresOwnerCosignAssertion: boolean;
};

/**
 * Single HTTP verifier signer used as fee payer **and** instruction `payer` /
 * `verifier` for set/clear token verifier and recovery wallet.
 *
 * When the co-signer is a Config default verifier, prompts the owner phone
 * passkey (WebAuthn) bound to the transaction message hash before `/sign`.
 * Custom token verifiers skip that step.
 */
export async function createAppVerifierSigner(
  rpc: Rpc<SolanaRpcApi>,
  phygitalToken: Address,
): Promise<AppVerifierSigner> {
  const { endpoint, requiresOwnerCosignAssertion, verifier } =
    await resolveVerifier(rpc, phygitalToken, {
      fetch: appVerifierFetch,
    });
  const token = String(phygitalToken);

  const signer = createVerifierEndpointSigner(verifier.address, {
    endpoint: verifierSignUrl(endpoint),
    fetch: appVerifierFetch,
    enrichSignBody: async (transactions) => {
      if (!requiresOwnerCosignAssertion) return undefined;
      if (transactions.length !== 1) {
        throw new Error("Config co-sign accepts exactly one transaction");
      }
      const [transaction] = transactions as readonly SignableTransaction[];
      if (!transaction) {
        throw new Error("Config co-sign accepts exactly one transaction");
      }
      const ownerAuth = await assertPolicyMutation(
        token,
        {
          kind: "cosignConfig",
          messageHash: bytesToBase64Url(
            new Uint8Array(transaction.messageBytes),
          ),
        },
        "Confirmation was cancelled",
      );
      return {
        challengeId: ownerAuth.challengeId,
        assertion: ownerAuth.assertion,
      };
    },
  });

  return {
    address: signer.address,
    requiresOwnerCosignAssertion,
    signTransactions: (transactions, options) =>
      signer.signTransactions(transactions, options),
  };
}
