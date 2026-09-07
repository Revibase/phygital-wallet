import {
  compileTransaction,
  type Address,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionPartialSigner,
} from "@solana/kit";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import {
  createVerifierEndpointSigner,
  resolveVerifier,
  verifierSignUrl,
} from "phygital-wallet-sdk";

import { getApiBaseUrl } from "@/lib/api-base";
import { bytesToBase64Url } from "@/lib/crypto/base64";
import { queryFetch } from "@/lib/queries/http";
import {
  buildUnsignedTransaction,
  signAndSendTransaction,
  type SentTransaction,
} from "@/lib/solana/tx";
import { assertPolicyMutation } from "@/lib/wallet/policies-client";

const DEFAULT_VERIFIER_API_ORIGIN = "https://api.revibase.com";

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

type OwnerCosignAuth = {
  challengeId: string;
  assertion: AuthenticationResponseJSON;
};

type AppVerifierSignerInternal = TransactionPartialSigner & {
  requiresOwnerCosignAssertion: boolean;
  phygitalToken: string;
  setOwnerCosignAuth: (auth: OwnerCosignAuth) => void;
};

export type AppVerifierSigner = TransactionPartialSigner & {
  /** True when `/sign` needs owner `cosignConfig` WebAuthn (Config default key). */
  requiresOwnerCosignAssertion: boolean;
};

/**
 * Single HTTP verifier signer used as fee payer **and** instruction `payer` /
 * `verifier` for set/clear token verifier and recovery wallet.
 *
 * Does **not** auto-prompt WebAuthn. Use {@link sendConfigTransaction} from a
 * user-gesture handler when `requiresOwnerCosignAssertion` is true.
 */
export async function createAppVerifierSigner(
  rpc: Rpc<SolanaRpcApi>,
  phygitalToken: Address,
): Promise<AppVerifierSigner> {
  const { endpoint, requiresOwnerCosignAssertion, verifier } =
    await resolveVerifier(rpc, phygitalToken, {
      fetch: appVerifierFetch,
    });

  let ownerAuth: OwnerCosignAuth | null = null;

  const endpointSigner = createVerifierEndpointSigner(verifier.address, {
    endpoint: verifierSignUrl(endpoint),
    fetch: appVerifierFetch,
    enrichSignBody: async () => {
      if (!requiresOwnerCosignAssertion) return undefined;
      if (!ownerAuth) {
        throw new Error("Confirm on this phone to continue");
      }
      const auth = ownerAuth;
      ownerAuth = null;
      return {
        challengeId: auth.challengeId,
        assertion: auth.assertion,
      };
    },
  });

  const signer: AppVerifierSignerInternal = {
    address: endpointSigner.address,
    requiresOwnerCosignAssertion,
    phygitalToken: String(phygitalToken),
    setOwnerCosignAuth: (auth) => {
      ownerAuth = auth;
    },
    signTransactions: (transactions, options) =>
      endpointSigner.signTransactions(transactions, options),
  };

  return signer;
}

/**
 * Broadcast a config tx. When the co-signer is a Config default verifier,
 * prompts platform WebAuthn — call only from a user-gesture handler (button).
 */
export async function sendConfigTransaction(args: {
  instructions: Instruction[];
  signer: AppVerifierSigner;
}): Promise<SentTransaction> {
  const signer = args.signer as AppVerifierSignerInternal;
  const unsigned = await buildUnsignedTransaction({
    instructions: args.instructions,
    feePayer: signer,
  });

  if (signer.requiresOwnerCosignAssertion) {
    const compiled = compileTransaction(unsigned);
    const ownerAuth = await assertPolicyMutation(
      signer.phygitalToken,
      {
        kind: "cosignConfig",
        messageHash: bytesToBase64Url(new Uint8Array(compiled.messageBytes)),
      },
      "Confirmation was cancelled",
    );
    signer.setOwnerCosignAuth(ownerAuth);
  }

  return signAndSendTransaction(unsigned);
}
