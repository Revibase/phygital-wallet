import type {
  Address,
  Rpc,
  SolanaRpcApi,
  Transaction,
  TransactionModifyingSigner,
  TransactionWithLifetime,
} from "@solana/kit";
import { authenticatePasskeyForSecp256r1Verify } from "phygital-token-sdk";

import { findWalletPda } from "../generated/pdas/wallet.js";
import {
  isAwaitingRemoteApproval,
  watchApprovalResolution,
} from "./approval-watch.js";
import { PolicyDeniedError, previewWalletIntent } from "./preview.js";
import {
  resolveVerifier,
  type VerifierAccountSnapshot,
} from "./resolve-verifier.js";
import { modifyAndWrapWalletTransaction } from "./wrap-transaction.js";

/**
 * Stages of `modifyAndSignTransactions` for hold / progress UI via
 * {@link PhygitalWalletSignerCallbacks.onPhaseChange}.
 */
export type PhygitalWalletSignPhase =
  | "preparing"
  | "previewing"
  | "awaitingRemoteApproval"
  | "awaitingPasskey"
  | "building"
  | "coSigning"
  | "complete";

export type PhygitalWalletSignPhaseContext = {
  remoteApproval?: {
    intentHash: string;
    watchTicket: string;
    code: string;
    error: string;
    details?: Record<string, unknown>;
  };
};

export type PhygitalWalletSignerCallbacks = {
  onPhaseChange?: (
    phase: PhygitalWalletSignPhase,
    context?: PhygitalWalletSignPhaseContext,
  ) => void;
};

export type PhygitalWalletSignerConfig = PhygitalWalletSignerCallbacks & {
  fetch?: typeof fetch;
  /** Host-resolved verifier+config; skips getMultipleAccounts. */
  snapshot?: VerifierAccountSnapshot;
  /**
   * When soft deny includes a `watchTicket`, wait for owner grant/deny inside
   * this `sign` (before SlotHashes / NFC). Default `false`: throw the soft
   * {@link PolicyDeniedError} so the caller can retry the same instructions
   * after the owner approves on their device. Set `true` only if you show
   * waiting UI for `awaitingRemoteApproval`.
   */
  waitForRemoteApproval?: boolean;
};

/**
 * Kit modifying signer for a phygital wallet PDA.
 * Soft deny with a `watchTicket` throws by default; set
 * `waitForRemoteApproval: true` to park until the owner acts (and handle
 * `awaitingRemoteApproval` in `onPhaseChange`).
 */
export async function getPhygitalWalletSigner(
  rpc: Rpc<SolanaRpcApi>,
  phygitalTokenPda: Address,
  config?: PhygitalWalletSignerConfig,
): Promise<TransactionModifyingSigner> {
  const [[walletPda], resolved] = await Promise.all([
    findWalletPda({ phygitalToken: phygitalTokenPda }),
    resolveVerifier(rpc, phygitalTokenPda, config),
  ]);

  const { verifier, endpoint, configPda, tokenVerifierPda } = resolved;
  const waitForRemoteApproval = config?.waitForRemoteApproval === true;

  const executeAccounts = {
    config: configPda,
    tokenVerifier: tokenVerifierPda,
    wallet: walletPda,
    phygitalToken: phygitalTokenPda,
  };

  return {
    address: walletPda,
    modifyAndSignTransactions: async (transactions, signConfig) => {
      signConfig?.abortSignal?.throwIfAborted();

      if (transactions.length !== 1) {
        throw new Error(
          "getPhygitalWalletSigner accepts exactly one transaction per sign",
        );
      }

      const [transaction] = transactions;
      if (!transaction) {
        throw new Error(
          "getPhygitalWalletSigner accepts exactly one transaction per sign",
        );
      }
      if (!("lifetimeConstraint" in transaction)) {
        throw new Error(
          "getPhygitalWalletSigner requires transactions with a lifetime constraint",
        );
      }

      config?.onPhaseChange?.("preparing");

      const wrapped = await modifyAndWrapWalletTransaction({
        rpc,
        transaction: transaction as Transaction & TransactionWithLifetime,
        walletPda,
        verifier,
        executeAccounts,
        abortSignal: signConfig?.abortSignal,
        preview: async (bodyInstructions) => {
          config?.onPhaseChange?.("previewing");
          try {
            await previewWalletIntent({
              phygitalToken: phygitalTokenPda,
              instructions: bodyInstructions,
              endpoint,
              fetch: config?.fetch,
              abortSignal: signConfig?.abortSignal,
            });
          } catch (error) {
            if (!waitForRemoteApproval || !isAwaitingRemoteApproval(error)) {
              throw error;
            }

            config?.onPhaseChange?.("awaitingRemoteApproval", {
              remoteApproval: {
                intentHash: error.intentHash,
                watchTicket: error.watchTicket,
                code: error.code,
                error: error.message,
                details: error.details,
              },
            });

            const resolution = await watchApprovalResolution({
              phygitalToken: String(phygitalTokenPda),
              intentHash: error.intentHash,
              watchTicket: error.watchTicket,
              endpoint,
              fetch: config?.fetch,
              abortSignal: signConfig?.abortSignal,
            });

            if (resolution.status === "denied") {
              throw new PolicyDeniedError({
                code: "approval_denied",
                error: "The owner declined this send.",
                soft: false,
                intentHash: error.intentHash,
                details: error.details,
              });
            }
            if (resolution.status === "cancelled") {
              throw new DOMException("Aborted", "AbortError");
            }
          }
        },
        authenticate: async (messageHash) => {
          config?.onPhaseChange?.("awaitingPasskey");
          const tap = await authenticatePasskeyForSecp256r1Verify({
            rpc,
            messageHash,
          });
          config?.onPhaseChange?.("building");
          return tap;
        },
        coSign: async (tx) => {
          config?.onPhaseChange?.("coSigning");
          const [verifierSignatures] = await verifier.signTransactions(
            [tx],
            signConfig,
          );
          if (!verifierSignatures) {
            throw new Error("Verifier returned no signature");
          }
          return verifierSignatures;
        },
      });

      config?.onPhaseChange?.("complete");
      return [wrapped];
    },
  };
}
