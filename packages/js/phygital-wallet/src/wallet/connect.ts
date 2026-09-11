/**
 * Connect a phygital accessory to its verifier and get back a ready signer.
 *
 * This is the whole integration surface for a website: one call performs the tap,
 * resolves the token's verifier from chain, exchanges the proof for a session
 * bearer, and hands back a signer with that bearer already wired in. Callers
 * never see a bearer, a blockhash, or an HTTP header.
 */
import { findPhygitalTokenPda, startAuthentication } from "phygital-token-sdk";
import type {
  Address,
  Rpc,
  SolanaRpcApi,
  TransactionModifyingSigner,
} from "@solana/kit";

import { resolveVerifier } from "./resolve-verifier.js";
import {
  getPhygitalWalletSigner,
  type PhygitalWalletSignerConfig,
} from "./signer.js";
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

export type PhygitalConnection = {
  phygitalToken: Address;
  /** Kit signer for wallet operations; the bearer is attached automatically. */
  signer: TransactionModifyingSigner;
  /**
   * Current session, for hosts that must persist or forward it. A function, not
   * a field, because it changes when the signer silently re-connects.
   */
  getSession: () => VerifierSessionBearer;
};

/** POST a WebAuthn connect proof to a verifier and return its bearer. */
async function connectVerifier(args: {
  /** Verifier API base (not the `/connect` path). */
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

/**
 * Tap → connect → signer, in one call.
 *
 * Prompts a WebAuthn/NFC hold against a fresh blockhash (fetched immediately
 * before the tap so it cannot age out mid-ceremony), derives the token from the
 * assertion, resolves its verifier, and connects. The returned signer re-connects
 * transparently if the session lapses, which costs another hold.
 *
 * The accessory tapped is *discovered*, not chosen: the returned `phygitalToken`
 * is whatever was held. Compare it yourself if your flow expects a specific item.
 * A re-connect is still pinned to the accessory from the first hold, so a lapsed
 * session can never silently swap to a different one.
 */
export async function connectPhygitalWallet(
  rpc: Rpc<SolanaRpcApi>,
  config: PhygitalWalletSignerConfig & {
    abortSignal?: AbortSignal;
  } = {}
): Promise<PhygitalConnection> {
  // Only this is captured by the long-lived renewal closure below, so the
  // caller's `config` (and its abortSignal) is not retained for the signer's life.
  const httpFetch = config.fetch;

  const connectOnce = async (
    abortSignal?: AbortSignal
  ): Promise<{
    phygitalToken: Address;
    resolved: Awaited<ReturnType<typeof resolveVerifier>>;
    session: VerifierSessionBearer;
  }> => {
    // Fetch the blockhash immediately before the tap: only the last ~300 are
    // valid (~2 min), so an early fetch risks expiring mid-ceremony.
    const { value: latest } = await rpc.getLatestBlockhash().send();
    const challenge = latest.blockhash;
    const response = await startAuthentication(challenge, rpc);

    const phygitalToken = await findPhygitalTokenPda(
      response.id
    );

    const resolved = await resolveVerifier(rpc, phygitalToken, {
      fetch: httpFetch,
    });
    const session = await connectVerifier({
      endpoint: resolved.endpoint,
      blockhash: challenge,
      response,
      fetch: httpFetch,
      abortSignal,
    });

    return { phygitalToken, resolved, session };
  };

  const first = await connectOnce(config.abortSignal);
  const phygitalToken = first.phygitalToken;
  let current = first.session;

  const signer = await getPhygitalWalletSigner(rpc, phygitalToken, {
    ...config,
    // Pass the verifier we just resolved so the signer does not re-fetch
    // TokenVerifier + Config for the same token.
    resolved: first.resolved,
    // Re-tap only when the session has actually lapsed.
    getAccessToken: async () => {
      if (current.expiresAt - SESSION_SKEW_MS > Date.now()) {
        return current.accessToken;
      }
      const renewed = await connectOnce();
      if (String(renewed.phygitalToken) !== String(phygitalToken)) {
        throw new AccessoryMismatchError();
      }
      current = renewed.session;
      return current.accessToken;
    },
  });

  return {
    phygitalToken,
    signer,
    getSession: () => current,
  };
}
