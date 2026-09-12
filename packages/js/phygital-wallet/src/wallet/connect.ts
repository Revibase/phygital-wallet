/**
 * Client-side connect primitives: tap an accessory to produce a proof, then
 * exchange that proof at the token's verifier for a short-lived session bearer.
 *
 * These mirror `startAuthentication` → `verifyResponse` from `phygital-token-sdk`
 * (the login flow). Feed the bearer to `getPhygitalWalletSigner` to sign. Bearers
 * are short-lived; a signer's `getAccessToken` should return the cached bearer and
 * throw once it lapses so the app can reconnect on an explicit user action —
 * never re-tap silently, which prompts the user out of nowhere.
 */
import { findPhygitalTokenPda, startAuthentication } from "phygital-token-sdk";
import type { Address, Rpc, SolanaRpcApi } from "@solana/kit";

import { resolveVerifier } from "./resolve-verifier.js";
import { verifierConnectUrl } from "./verifier-endpoint.js";

/** Treat a session as spent slightly early so it cannot lapse mid-request. */
export const SESSION_SKEW_MS = 5_000;

/** The tap came from a different accessory than the caller required. */
export class AccessoryMismatchError extends Error {
  readonly code = "token_mismatch";
  constructor(message = "That isn’t the same accessory") {
    super(message);
    this.name = "AccessoryMismatchError";
  }
}

export type VerifierSessionBearer = {
  /** Opaque to clients — pass it through, never parse it. */
  accessToken: string;
  /** ms since epoch. */
  expiresAt: number;
};

/**
 * A client-side connect proof, before it has been exchanged for a bearer.
 *
 * This is the connect-flow analog of the value `startAuthentication` returns for
 * login: the tap has happened, but nothing has been verified or minted yet. Hand
 * `blockhash` + `response` to a verifier — Revibase's `/connect`, or your own
 * server running `verifyConnectProof` when you operate the co-signer.
 */
export type PhygitalConnectProof = {
  /** Recent blockhash used as the WebAuthn challenge. */
  blockhash: string;
  /** WebAuthn assertion from the tap. Opaque — forward it, don't parse it. */
  response: Awaited<ReturnType<typeof startAuthentication>>;
  /** Token PDA derived from the assertion's passkey. */
  phygitalToken: Address;
  /** Verifier resolved for this token (its API base is `resolved.endpoint`). */
  resolved: Awaited<ReturnType<typeof resolveVerifier>>;
};

/**
 * Client step: tap and produce a connect proof — the connect-flow counterpart to
 * `startAuthentication`. Fetches a fresh blockhash immediately before the hold
 * (only the last ~300 are valid, ~2 min, so an early fetch risks expiring
 * mid-ceremony), prompts the WebAuthn/NFC hold against it, derives the token from
 * the assertion, and resolves the token's verifier.
 *
 * Pair it with a verify step: POST the proof to the verifier yourself (or via
 * `exchangeConnectProof`), or — if you run the co-signer — verify it on your own
 * server with `verifyConnectProof` from `phygital-verifier-sdk`, then mint a
 * bearer. Feed the bearer to `getPhygitalWalletSigner` to sign.
 */
export async function startPhygitalConnect(
  rpc: Rpc<SolanaRpcApi>,
  config: { fetch?: typeof fetch } = {},
): Promise<PhygitalConnectProof> {
  const { value: latest } = await rpc.getLatestBlockhash().send();
  const blockhash = latest.blockhash;
  const response = await startAuthentication(blockhash, rpc);
  const phygitalToken = await findPhygitalTokenPda(response.id);
  const resolved = await resolveVerifier(rpc, phygitalToken, {
    fetch: config.fetch,
  });
  return { blockhash, response, phygitalToken, resolved };
}

/**
 * Client step: POST a connect proof to a verifier's `/connect` and return its
 * bearer — the verify-and-mint counterpart to `verifyResponse`, for callers that
 * let the browser talk to the verifier directly. Skip it and call your own
 * backend instead when the browser must not talk to the verifier directly.
 */
export async function exchangeConnectProof(args: {
  /** Verifier API base (not the `/connect` path) — e.g. `resolved.endpoint`. */
  endpoint: string;
  /** Recent blockhash — the signed challenge. */
  blockhash: string;
  response: unknown;
  fetch?: typeof fetch;
  abortSignal?: AbortSignal;
}): Promise<VerifierSessionBearer> {
  const httpFetch = args.fetch ?? fetch;
  const res = await httpFetch(verifierConnectUrl(args.endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blockhash: args.blockhash,
      response: args.response,
    }),
    signal: args.abortSignal,
  });

  const body = (await res.json().catch(() => ({}))) as {
    accessToken?: string;
    expiresAt?: number;
    error?: string;
    code?: string;
  };
  if (!res.ok || !body.accessToken) {
    throw new Error(body.error ?? `Verifier connect failed (${res.status})`);
  }
  return {
    accessToken: body.accessToken,
    expiresAt: body.expiresAt ?? Date.now(),
  };
}
