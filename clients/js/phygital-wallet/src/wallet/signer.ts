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
import { resolveVerifier } from "./resolve-verifier.js";
import { modifyAndWrapWalletTransaction } from "./wrap-transaction.js";

/**
 * Stages of `modifyAndSignTransactions` — use for hold / progress UI.
 *
 * Order on success:
 * `preparing` → `previewing` → `awaitingPasskey` → `building` → `coSigning` → `complete`
 */
export type PhygitalWalletSignPhase =
  | "preparing"
  | "previewing"
  | "awaitingPasskey"
  | "building"
  | "coSigning"
  | "complete";

export type PhygitalWalletSignerCallbacks = {
  /**
   * Fired when the wrap/sign pipeline enters a new phase.
   * Primary hook for ceremony copy (“Checking limits…”, “Hold to confirm…”, …).
   */
  onPhaseChange?: (phase: PhygitalWalletSignPhase) => void;
  /** Fired after policy preview succeeds, before the passkey challenge is built. */
  onPreviewed?: () => void;
  /** Fired immediately before the NFC / platform passkey prompt. */
  onPasskeyPrompt?: () => void;
  /** Fired after the accessory / passkey authentication succeeds. */
  onPasskeyAuthenticated?: () => void;
  /** Fired after the verifier co-signs and the wrapped tx is ready. */
  onSigned?: () => void;
  /**
   * Fired if wrap/sign fails (policy deny, abort, WebAuthn cancel, etc.).
   * The error is still rethrown after this callback.
   */
  onError?: (error: unknown) => void;
};

export type PhygitalWalletSignerConfig = PhygitalWalletSignerCallbacks & {
  fetch?: typeof fetch;
};

function notifyPhase(
  callbacks: PhygitalWalletSignerCallbacks | undefined,
  phase: PhygitalWalletSignPhase,
): void {
  callbacks?.onPhaseChange?.(phase);
}

/**
 * Kit modifying signer for a phygital wallet.
 *
 * Pass the token PDA (`verifyResponse().phygitalTokenPda` / NFC auth).
 */
export async function getPhygitalWalletSigner(
  rpc: Rpc<SolanaRpcApi>,
  phygitalTokenPda: Address,
  config?: PhygitalWalletSignerConfig,
): Promise<TransactionModifyingSigner> {
  const [[walletPda], { verifier, endpoint, configPda, tokenVerifierPda }] =
    await Promise.all([
      findWalletPda({ phygitalToken: phygitalTokenPda }),
      resolveVerifier(rpc, phygitalTokenPda, config),
    ]);

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

      try {
        notifyPhase(config, "preparing");

        const wrapped = await modifyAndWrapWalletTransaction({
          rpc,
          transaction: transaction as Transaction & TransactionWithLifetime,
          walletPda,
          verifier,
          executeAccounts,
          abortSignal: signConfig?.abortSignal,
          preview: async (bodyInstructions) => {
            notifyPhase(config, "previewing");
            await previewWalletIntent({
              phygitalToken: phygitalTokenPda,
              instructions: bodyInstructions,
              endpoint,
              fetch: config?.fetch,
              abortSignal: signConfig?.abortSignal,
            });
            config?.onPreviewed?.();
          },
          authenticate: async (messageHash) => {
            notifyPhase(config, "awaitingPasskey");
            config?.onPasskeyPrompt?.();
            const tap = await authenticatePasskeyForSecp256r1Verify({
              rpc,
              messageHash,
            });
            config?.onPasskeyAuthenticated?.();
            // Finalize (CU / fees / blockhash) runs next inside wrap.
            notifyPhase(config, "building");
            return tap;
          },
          coSign: async (tx) => {
            notifyPhase(config, "coSigning");
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

        notifyPhase(config, "complete");
        config?.onSigned?.();
        return [wrapped];
      } catch (error) {
        config?.onError?.(error);
        throw error;
      }
    },
  };
}
