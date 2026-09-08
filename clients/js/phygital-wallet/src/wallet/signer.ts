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
import { previewWalletIntent } from "./preview.js";
import {
  resolveVerifier,
  type VerifierAccountSnapshot,
} from "./resolve-verifier.js";
import { modifyAndWrapWalletTransaction } from "./wrap-transaction.js";

/**
 * Stages of `modifyAndSignTransactions` — optional hold / progress UI via
 * {@link PhygitalWalletSignerCallbacks.onPhaseChange}.
 */
export type PhygitalWalletSignPhase =
  | "preparing"
  | "previewing"
  | "awaitingPasskey"
  | "building"
  | "coSigning"
  | "complete";

export type PhygitalWalletSignerCallbacks = {
  /** Optional ceremony / progress UI. */
  onPhaseChange?: (phase: PhygitalWalletSignPhase) => void;
};

export type PhygitalWalletSignerConfig = PhygitalWalletSignerCallbacks & {
  fetch?: typeof fetch;
  /** Host-resolved verifier+config; skips getMultipleAccounts. */
  snapshot?: VerifierAccountSnapshot;
};

/**
 * Kit modifying signer for a phygital wallet.
 *
 * Pass the token PDA (`verifyResponse().phygitalTokenPda` / NFC auth).
 * Use like any other Kit signer: build a message, then
 * `signTransactionMessageWithSigners`. Handle failures in `catch`.
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
          await previewWalletIntent({
            phygitalToken: phygitalTokenPda,
            instructions: bodyInstructions,
            endpoint,
            fetch: config?.fetch,
            abortSignal: signConfig?.abortSignal,
          });
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
