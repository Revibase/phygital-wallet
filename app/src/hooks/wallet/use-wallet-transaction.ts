"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Instruction } from "@solana/kit";
import type { PolicyDeniedError } from "phygital-wallet-sdk";
import { toast } from "sonner";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { useTokenAuthority } from "@/hooks/token/use-token-authority";
import { useWalletSessionMode } from "@/hooks/wallet/use-wallet-session-mode";
import { errorCopy } from "@/lib/copy/phygital";
import type { SentTransaction } from "@/lib/solana/tx";
import { sendViaAuthority } from "@/lib/wallet/send-via-authority";
import { toUserErrorMessage } from "@/lib/user-errors";
import {
  runWalletTransaction,
  type PolicyDenialDecision,
  type RunWalletTransactionArgs,
  type WalletTransactionMode,
  type WalletTransactionOutcome,
} from "@/lib/wallet/wallet-transaction";

/** State for the shared <WalletApprovalSheet>. */
export type WalletApprovalState = {
  open: boolean;
  mode: "owner" | "signIn" | "visitor";
  error: PolicyDeniedError | null;
  busy: boolean;
  onApprove: () => void;
  onSignIn: () => void;
  onCancel: () => void;
};

/** Call-site args — the hook injects `resolvePolicyDenial` (authority + modal). */
export type WalletTransactionRunArgs<S> = Omit<
  RunWalletTransactionArgs<S>,
  "resolvePolicyDenial" | "preferredMode"
> & {
  /** Override session default (e.g. fee top-up always uses executeWithAuthority). */
  preferredMode?: WalletTransactionMode;
};

export type WalletTransactionController = {
  run: <S>(
    args: WalletTransactionRunArgs<S>,
  ) => Promise<WalletTransactionOutcome>;
  sendWithAuthority: (
    instructions: Instruction[],
    abortSignal?: AbortSignal,
  ) => Promise<SentTransaction>;
  isAuthority: boolean;
  /** Owner-browse admit: spends via executeWithAuthority (no NFC Hold). */
  isOwnerBrowse: boolean;
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
  const session = useWalletSessionMode(phygitalToken);
  const isOwnerBrowse = session.data === "owner";
  const isAuthority = Boolean(
    isAuthenticated && address && authority.data?.authority === address,
  );

  const liveRef = useRef({
    address,
    signer,
    authority: authority.data?.authority ?? null,
    isOwnerBrowse,
  });
  useEffect(() => {
    liveRef.current = {
      address,
      signer,
      authority: authority.data?.authority ?? null,
      isOwnerBrowse,
    };
  }, [address, signer, authority.data?.authority, isOwnerBrowse]);

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
      const live = liveRef.current;
      if (!live.address || !live.signer) {
        throw new Error("Sign in as the owner to approve this transaction");
      }
      return sendViaAuthority({
        phygitalToken,
        authority: live.signer,
        instructions,
        abortSignal,
      });
    },
    [phygitalToken],
  );

  const resolvePolicyDenial = useCallback(
    (error: PolicyDeniedError): Promise<PolicyDenialDecision> =>
      new Promise<PolicyDenialDecision>((resolve) => {
        decideRef.current = resolve;
        const live = liveRef.current;
        const mode = !live.address
          ? "signIn"
          : live.authority === live.address
            ? "owner"
            : "visitor";
        setModal({
          open: true,
          mode,
          error,
          busy: false,
        });
      }),
    [],
  );

  const run = useCallback(
    async <S>(
      args: WalletTransactionRunArgs<S>,
    ): Promise<WalletTransactionOutcome> => {
      const preferredMode: WalletTransactionMode =
        args.preferredMode ??
        (liveRef.current.isOwnerBrowse ? "authority" : "policy");

      if (preferredMode === "authority") {
        let live = liveRef.current;
        if (!live.address || !live.signer) {
          try {
            await login();
          } catch (err) {
            toast.error(
              toUserErrorMessage(err, errorCopy.signerFailed.body),
            );
            return { status: "aborted" };
          }
          live = liveRef.current;
          if (!live.address || !live.signer) {
            return { status: "aborted" };
          }
        }
        if (live.authority && live.authority !== live.address) {
          toast.error(errorCopy.signerFailed.body);
          return { status: "aborted" };
        }
      }

      try {
        return await runWalletTransaction<S>({
          ...args,
          preferredMode,
          resolvePolicyDenial,
        });
      } finally {
        decideRef.current = null;
        setModal(CLOSED);
      }
    },
    [login, resolvePolicyDenial],
  );

  return {
    run,
    sendWithAuthority,
    isAuthority,
    isOwnerBrowse,
    approval: { ...modal, onApprove, onSignIn, onCancel },
  };
}
