/**
 * Tap → verifier session, and the full Hold → app-session ceremony.
 *
 *   Hold → startPhygitalConnect (tap, produce proof) → exchangeConnectProof
 *        → bearer, minted by the token's *own* verifier (Revibase's or a third
 *          party's) → optionally POST /auth/app-session for the browse cookie
 *
 * The bearer always comes from the token's own verifier, which is why the
 * app-session exchange can verify it against the on-chain verifier set.
 */
import {
  AccessoryMismatchError,
  exchangeConnectProof,
  startPhygitalConnect,
  type PhygitalConnectProof,
} from "phygital-wallet-sdk";

import { getSolanaRpc } from "@/lib/solana/rpc";
import {
  adoptVerifierSession,
  type VerifierSession,
} from "@/lib/wallet/verifier-session";

export type AccessoryConnection = {
  phygitalToken: string;
  expiresAt: number;
};

/**
 * Low-level tap: produce a connect proof and exchange it at the token's verifier
 * for a bearer. No app-session cookie and no store caching — callers use the
 * returned `proof` (to build a signer) and `session` (to cache) as they need.
 *
 * Throws {@link AccessoryMismatchError} when `expectedPhygitalToken` is given and
 * the tap came from a different accessory, so callers can branch on the type
 * rather than on message text.
 */
export async function connectVerifierSession(opts?: {
  expectedPhygitalToken?: string;
}): Promise<{
  phygitalToken: string;
  proof: PhygitalConnectProof;
  session: VerifierSession;
}> {
  const proof = await startPhygitalConnect(getSolanaRpc());
  const phygitalToken = String(proof.phygitalToken);
  if (
    opts?.expectedPhygitalToken &&
    opts.expectedPhygitalToken !== phygitalToken
  ) {
    throw new AccessoryMismatchError();
  }
  const session = await exchangeConnectProof({
    endpoint: proof.resolved.endpoint,
    blockhash: proof.blockhash,
    response: proof.response,
  });
  return { phygitalToken, proof, session };
}

/**
 * Finish a Hold: tap, mint the bearer, cache it for `/preview`+`/sign`, then
 * exchange it for the Revibase app-session cookie. Use this at entry points that
 * log the tapper in.
 */
export async function completeAccessoryConnection(opts?: {
  expectedPhygitalToken?: string;
}): Promise<AccessoryConnection> {
  const { phygitalToken, session } = await connectVerifierSession(opts);
  return adoptVerifierSession(phygitalToken, session);
}
