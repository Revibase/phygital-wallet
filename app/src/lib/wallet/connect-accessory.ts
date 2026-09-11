/**
 * One tap → verifier session + Revibase app session.
 *
 * Shared by every Hold entry point so the ceremony exists once:
 *
 *   Hold → resolve the token's verifier → POST {verifier}/connect → bearer
 *        → POST /auth/app-session (exchange bearer for the browse cookie)
 *
 * The bearer always comes from the token's *own* verifier (Revibase's or a third
 * party's), which is why the app-session exchange can verify it against the
 * on-chain verifier set. The bearer is cached in memory for `/preview`+`/sign`.
 */
import { AccessoryMismatchError, connectPhygitalWallet } from "phygital-wallet-sdk";

import { getSolanaRpc } from "@/lib/solana/rpc";
import { adoptVerifierSession } from "@/lib/wallet/verifier-session";

export type AccessoryConnection = {
  phygitalToken: string;
  expiresAt: number;
};

/**
 * Finish a Hold: let the SDK perform the tap, verifier exchange, and session
 * setup, then exchange the bearer for the app-session cookie.
 *
 * Throws {@link AccessoryMismatchError} when `expectedPhygitalToken` is given and
 * the tap came from a different accessory, so callers can branch on the type
 * rather than on message text.
 */
export async function completeAccessoryConnection(
  opts?: { expectedPhygitalToken?: string },
): Promise<AccessoryConnection> {
  const connection = await connectPhygitalWallet(getSolanaRpc());
  const phygitalToken = String(connection.phygitalToken);
  if (
    opts?.expectedPhygitalToken &&
    opts.expectedPhygitalToken !== phygitalToken
  ) {
    throw new AccessoryMismatchError();
  }

  return adoptVerifierSession(phygitalToken, connection.getSession());
}
