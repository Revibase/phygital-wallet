/**
 * Unlink may only clear DO ownership after on-chain teardown:
 * token verifier override PDA and recovery wallet PDA must both be closed.
 */
import { address, createSolanaRpc, fetchEncodedAccounts } from "@solana/kit";
import {
  findRecoveryWalletAccountPda,
  findTokenVerifierPda,
} from "phygital-wallet-sdk";

import { getSolanaRpc } from "@/shared/solana/cluster";

export type UnlinkTeardownBlockers = {
  recoveryWallet: boolean;
  tokenVerifier: boolean;
};

export type UnlinkTeardownResult =
  | { ok: true }
  | {
      ok: false;
      code: "teardown_required";
      error: string;
      details: UnlinkTeardownBlockers;
    };

export function unlinkTeardownFromPresence(
  blockers: UnlinkTeardownBlockers,
): UnlinkTeardownResult {
  if (!blockers.recoveryWallet && !blockers.tokenVerifier) {
    return { ok: true };
  }
  const parts: string[] = [];
  if (blockers.recoveryWallet) parts.push("recovery wallet");
  if (blockers.tokenVerifier) parts.push("custom signing verifier");
  return {
    ok: false,
    code: "teardown_required",
    error: `Clear ${parts.join(" and ")} on-chain before unlinking.`,
    details: blockers,
  };
}

/** True when both PDAs are absent (safe to wipe DO owner). */
export async function assertOnChainUnlinkTeardown(
  phygitalToken: string,
): Promise<UnlinkTeardownResult> {
  const rpc = getSolanaRpc();
  const token = address(phygitalToken);
  const [[tokenVerifierPda], [recoveryWalletPda]] = await Promise.all([
    findTokenVerifierPda({ phygitalToken: token }),
    findRecoveryWalletAccountPda({ phygitalToken: token }),
  ]);
  const [tokenVerifier, recoveryWallet] = await fetchEncodedAccounts(rpc, [
    tokenVerifierPda,
    recoveryWalletPda,
  ]);
  return unlinkTeardownFromPresence({
    recoveryWallet: recoveryWallet.exists,
    tokenVerifier: tokenVerifier.exists,
  });
}
