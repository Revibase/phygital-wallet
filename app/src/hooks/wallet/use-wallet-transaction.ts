"use client";

import { useCallback, useRef, useState } from "react";
import type { Instruction } from "@solana/kit";
import type { PolicyDeniedError } from "phygital-wallet-sdk";
import { toast } from "sonner";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { useTokenAuthority } from "@/hooks/token/use-token-authority";
import { errorCopy } from "@/lib/copy/phygital";
import type { SentTransaction } from "@/lib/solana/tx";
import { sendViaAuthority } from "@/lib/wallet/execute-with-authority";
import { toUserErrorMessage } from "@/lib/user-errors";
import {
  runWalletTransaction,
  type PolicyDenialDecision,
  type RunWalletTransactionArgs,
  type WalletTransactionOutcome,
} from "@/lib/wallet/wallet-transaction";

/** State for the shared <WalletApprovalSheet>. */
export type WalletApprovalState = {
  open: boolean;
  /**
   * owner = authority can approve → executeWithAuthority;
   * signIn = soft-deny but owner session missing;
   * visitor = rejection only.
   */
  mode: "owner" | "signIn" | "visitor";
  error: PolicyDeniedError | null;
  /** Authority signing in flight after Approve. */
  busy: boolean;
  onApprove: () => void;
  onSignIn: () => void;
  onCancel: () => void;
};

/** Call-site args — the hook injects `resolvePolicyDenial` (authority + modal). */
export type WalletTransactionRunArgs<S> = Omit<
  RunWalletTransactionArgs<S>,
  "resolvePolicyDenial"
>;

export type WalletTransactionController = {
  run: <S>(
    args: WalletTransactionRunArgs<S>,
  ) => Promise<WalletTransactionOutcome>;
  /** Authority fallback send (executeWithAuthority) — use for `send("authority")`. */
  sendWithAuthority: (
    instructions: Instruction[],
    abortSignal?: AbortSignal,
  ) => Promise<SentTransaction>;
  /** True when the connected wallet is the accessory's on-chain authority. */
  isAuthority: boolean;
  approval: WalletApprovalState;
};

const CLOSED: Omit<WalletApprovalState, "onApprove" | "onSignIn" | "onCancel"> =
  {
    open: false,
    mode: "owner",
    error: null,
    busy: false,
  };

/**
 * Centralized transaction mutation controller. Wires `runWalletTransaction` to
 * the connected owner/authority and a shared approval/rejection modal so every
 * mutation gets identical optimistic + confirm + rollback + policy/authority
 * behavior. Render the returned `approval` via <WalletApprovalSheet>.
 */
export function useWalletTransaction(
  phygitalToken: string,
): WalletTransactionController {
  const { isAuthenticated, address, signer, login } = useOwnerWallet();
  const authority = useTokenAuthority(phygitalToken);
  const isAuthority = Boolean(
    isAuthenticated && address && authority.data?.authority === address,
  );

  const [modal, setModal] = useState(CLOSED);
  const decideRef = useRef<((decision: PolicyDenialDecision) => void) | null>(
    null,
  );

  const onApprove = useCallback(() => {
    if (!decideRef.current) return;
    // Keep the sheet up with a spinner while the authority signs / sends.
    setModal((prev) => ({ ...prev, busy: true }));
    const decide = decideRef.current;
    decideRef.current = null;
    decide("authority");
  }, []);

  const onCancel = useCallback(() => {
    const decide = decideRef.current;
    decideRef.current = null;
    setModal(CLOSED);
    decide?.("rejected");
  }, []);

  const onSignIn = useCallback(() => {
    const decide = decideRef.current;
    decideRef.current = null;
    setModal(CLOSED);
    decide?.("rejected");
    void login().catch((err) =>
      toast.error(toUserErrorMessage(err, errorCopy.signerFailed.body)),
    );
  }, [login]);

  const sendWithAuthority = useCallback(
    (instructions: Instruction[], abortSignal?: AbortSignal) => {
      if (!address || !signer) {
        throw new Error("Sign in as the owner to approve this transaction");
      }
      return sendViaAuthority({
        phygitalToken,
        owner: signer,
        instructions,
        abortSignal,
      });
    },
    [address, signer, phygitalToken],
  );

  const resolvePolicyDenial = useCallback(
    (error: PolicyDeniedError): Promise<PolicyDenialDecision> =>
      new Promise<PolicyDenialDecision>((resolve) => {
        decideRef.current = resolve;
        const mode = !isAuthenticated
          ? "signIn"
          : isAuthority
            ? "owner"
            : "visitor";
        setModal({
          open: true,
          mode,
          error,
          busy: false,
        });
      }),
    [isAuthenticated, isAuthority],
  );

  const run = useCallback(
    async <S>(
      args: WalletTransactionRunArgs<S>,
    ): Promise<WalletTransactionOutcome> => {
      try {
        return await runWalletTransaction<S>({ ...args, resolvePolicyDenial });
      } finally {
        decideRef.current = null;
        setModal(CLOSED);
      }
    },
    [resolvePolicyDenial],
  );

  return {
    run,
    sendWithAuthority,
    isAuthority,
    approval: { ...modal, onApprove, onSignIn, onCancel },
  };
}
