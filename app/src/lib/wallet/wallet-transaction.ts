/**
 * Centralized wallet-transaction flow shared by every tx-sending mutation.
 *
 * Contract (see the send-flow / receive / top-up call sites):
 *  1. Optimistic by default — a *sent* tx is treated as success immediately: the
 *     UI is updated, then confirmation runs asynchronously. On confirm success
 *     nothing changes; on confirm failure the optimistic state is rolled back
 *     and an error is surfaced.
 *  2. Default signer — `send("policy")` runs the `getPhygitalWalletSigner`
 *     (passkey + policy) path: simulate → send → optimistic → confirm async.
 *  3. Policy rejection — when the paymaster rejects simulation with a
 *     {@link PolicyDeniedError}, branch via `resolvePolicyDenial`: the connected
 *     authority may approve and fall back through `send("authority")`
 *     (executeWithAuthority), or the denial is a rejection and we stop with no
 *     optimistic update. A funding denial (insufficient fee balance) is a hard
 *     stop handled by `onFundingDenial` — authority approval cannot bypass it.
 *
 * This owns the optimistic/confirm/rollback wiring and the denial branching so
 * call sites only declare *how* to send/build each path and *what* to patch.
 */
import { PolicyDeniedError } from "phygital-wallet-sdk";

import type { SentTransaction } from "@/lib/solana/tx";

export type WalletTransactionMode = "policy" | "authority";

export type OptimisticOps<S> = {
  /**
   * Apply the optimistic cache update for the accepted tx signature; return a
   * snapshot the confirm/rollback callbacks can use.
   */
  apply: (signature: string) => S;
  /** Confirmation landed — optional cleanup (e.g. clear pending flag). */
  confirm?: (snapshot: S) => void;
  /** Confirmation failed — undo the optimistic update. */
  rollback: (snapshot: S) => void;
};

/** Authority may bypass via executeWithAuthority, or the send is rejected. */
export type PolicyDenialDecision = "authority" | "rejected";

/** Denials an authority signature cannot bypass (paymaster funding, not policy). */
const FUNDING_DENIAL_CODES = new Set<string>(["insufficient_fee_balance"]);

export function isFundingDenial(error: PolicyDeniedError): boolean {
  return FUNDING_DENIAL_CODES.has(error.code);
}

export type WalletTransactionOutcome =
  | { status: "sent"; signature: string; mode: WalletTransactionMode }
  | { status: "rejected"; error: PolicyDeniedError }
  | { status: "aborted" }
  | { status: "error"; error: unknown };

export type RunWalletTransactionArgs<S> = {
  /** Send via the given path; resolves once the RPC accepts the tx. */
  send: (mode: WalletTransactionMode) => Promise<SentTransaction>;
  optimistic: OptimisticOps<S>;
  /** Tx accepted + optimistic state applied (e.g. success UI, toast, onSent). */
  onSent?: (signature: string, mode: WalletTransactionMode) => void;
  /**
   * Decide how to resolve an authority-bypassable policy denial: "authority" to
   * fall back through executeWithAuthority, or "rejected" to stop.
   */
  resolvePolicyDenial: (
    error: PolicyDeniedError
  ) => Promise<PolicyDenialDecision>;
  /** Non-bypassable denial (insufficient fee balance). No send, no optimistic. */
  onFundingDenial?: (error: PolicyDeniedError) => void;
  /** Confirmation failed after the optimistic update was applied. */
  onConfirmError: (error: unknown) => void;
  /** Pre-send failure — never broadcast, no optimistic update applied. */
  onError: (error: unknown) => void;
  isAbortError?: (error: unknown) => boolean;
};

function defaultIsAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export async function runWalletTransaction<S>(
  args: RunWalletTransactionArgs<S>
): Promise<WalletTransactionOutcome> {
  const isAbort = args.isAbortError ?? defaultIsAbortError;

  const applyOptimistic = (
    sent: SentTransaction,
    mode: WalletTransactionMode
  ): void => {
    const snapshot = args.optimistic.apply(sent.signature);
    args.onSent?.(sent.signature, mode);
    void sent.confirmed.then(
      () => args.optimistic.confirm?.(snapshot),
      (err) => {
        args.optimistic.rollback(snapshot);
        args.onConfirmError(err);
      }
    );
  };

  const sendAndApply = async (
    mode: WalletTransactionMode
  ): Promise<WalletTransactionOutcome> => {
    const sent = await args.send(mode);
    applyOptimistic(sent, mode);
    return { status: "sent", signature: sent.signature, mode };
  };

  try {
    return await sendAndApply("policy");
  } catch (error) {
    if (isAbort(error)) return { status: "aborted" };

    if (error instanceof PolicyDeniedError) {
      if (isFundingDenial(error)) {
        args.onFundingDenial?.(error);
        return { status: "rejected", error };
      }
      const decision = await args.resolvePolicyDenial(error);
      if (decision === "rejected") return { status: "rejected", error };

      try {
        return await sendAndApply("authority");
      } catch (authorityError) {
        if (isAbort(authorityError)) return { status: "aborted" };
        args.onError(authorityError);
        return { status: "error", error: authorityError };
      }
    }

    args.onError(error);
    return { status: "error", error };
  }
}
