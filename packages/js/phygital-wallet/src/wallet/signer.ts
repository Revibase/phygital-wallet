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
  createVerifierEndpointSigner,
  resolveVerifier,
  type ResolvedVerifier,
} from "./resolve-verifier.js";
import { modifyAndWrapWalletTransaction } from "./wrap-transaction.js";
import { verifierSignUrl } from "./verifier-endpoint.js";

/**
 * Stages of `modifyAndSignTransactions` for hold / progress UI via
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
  onPhaseChange?: (phase: PhygitalWalletSignPhase) => void;
};

export type PhygitalWalletSignerConfig = PhygitalWalletSignerCallbacks & {
  fetch?: typeof fetch;
  /**
   * Verifier session bearer for `/preview` + `/sign` (both are bearer-only).
   * Obtain one with `startPhygitalConnect` + `exchangeConnectProof` (or your own
   * backend), then return it here — cached, and re-fetched when it lapses.
   */
  getAccessToken?: () => string | null | Promise<string | null>;
  /**
   * Verifier already resolved for this token. Pass it to skip a redundant
   * TokenVerifier + Config fetch when the caller just resolved it.
   */
  resolved?: ResolvedVerifier;
};

/**
 * Kit modifying signer for a phygital wallet PDA.
 * Soft deny throws {@link PolicyDeniedError}; retry the same instructions
 * after the owner grants on their device.
 */
export async function getPhygitalWalletSigner(
  rpc: Rpc<SolanaRpcApi>,
  phygitalTokenPda: Address,
  config?: PhygitalWalletSignerConfig,
): Promise<TransactionModifyingSigner> {
  const [[walletPda], resolved] = await Promise.all([
    findWalletPda({ phygitalToken: phygitalTokenPda }),
    config?.resolved ?? resolveVerifier(rpc, phygitalTokenPda, config),
  ]);

  const verifier =
    config?.resolved && config.getAccessToken
      ? createVerifierEndpointSigner(resolved.verifierAddress, {
          endpoint: verifierSignUrl(resolved.endpoint),
          fetch: config.fetch,
          getAccessToken: config.getAccessToken,
        })
      : resolved.verifier;
  const { endpoint, configPda, tokenVerifierPda } = resolved;

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
            instructions: bodyInstructions,
            endpoint,
            fetch: config?.fetch,
            getAccessToken: config?.getAccessToken,
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
