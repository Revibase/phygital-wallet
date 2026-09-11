import {
  compileTransaction,
  type Address,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionPartialSigner,
} from "@solana/kit";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { resolveVerifier } from "phygital-wallet-sdk";

import { getApiBaseUrl } from "@/lib/api-base";
import { bytesToBase64Url } from "@/lib/crypto/base64";
import { queryFetch } from "@/lib/queries/http";
import {
  buildUnsignedTransaction,
  signAndSendTransaction,
  type SentTransaction,
} from "@/lib/solana/tx";
import { assertPolicyMutation } from "@/lib/wallet/policies-client";
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

function isSignRequest(url: string, init?: RequestInit): boolean {
  if ((init?.method ?? "GET").toUpperCase() !== "POST") return false;
  try {
    return new URL(url, "http://local").pathname.endsWith("/sign");
  } catch {
    return url.includes("/sign");
  }
}

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
  let ownerAuth: OwnerCosignAuth | null = null;
  let requiresOwnerCosignAssertion = false;

  const resolved = await resolveVerifier(rpc, phygitalToken, {
    getAccessToken: accessTokenFor(String(phygitalToken)),
    fetch: (input, init) => {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : String(input);

      let nextInit = init;
      if (requiresOwnerCosignAssertion && isSignRequest(raw, init)) {
        if (!ownerAuth) {
          throw new Error("Confirm on this phone to continue");
        }
        const auth = ownerAuth;
        ownerAuth = null;
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        nextInit = {
          ...init,
          body: JSON.stringify({
            ...body,
            challengeId: auth.challengeId,
            assertion: auth.assertion,
          }),
        };
      }

      return appVerifierFetch(input, nextInit);
    },
  });
  requiresOwnerCosignAssertion = resolved.requiresOwnerCosignAssertion;

  const signer: AppVerifierSignerInternal = {
    address: resolved.verifier.address,
    requiresOwnerCosignAssertion,
    phygitalToken: String(phygitalToken),
    setOwnerCosignAuth: (auth) => {
      ownerAuth = auth;
    },
    signTransactions: (transactions, options) =>
      resolved.verifier.signTransactions(transactions, options),
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
