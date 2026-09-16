import type {
  Address,
  Rpc,
  SolanaRpcApi,
  Transaction,
  TransactionModifyingSigner,
  TransactionPartialSigner,
  TransactionWithLifetime,
} from "@solana/kit";
import { isTransactionWithDurableNonceLifetime } from "@solana/kit";
import { authenticatePasskeyForSecp256r1Verify } from "phygital-token-sdk";
import { modifyAndWrapWalletTransaction } from "./wrap-transaction.js";
import {
  fetchAuthority,
  findAuthorityAccountPda,
  findWalletPda,
} from "../generated/index.js";
import { createDefaultFeePayer } from "./fee-payer.js";

export type PhygitalWalletSignPhase =
  | "preparing"
  | "previewing"
  | "awaitingPasskey"
  | "building"
  | "feePaying"
  | "complete";

export type PhygitalWalletSignerCallbacks = {
  onPhaseChange?: (phase: PhygitalWalletSignPhase) => void;
};

export type PhygitalWalletSignerConfig = PhygitalWalletSignerCallbacks & {
  fetch?: typeof fetch;
  feePayer?: TransactionPartialSigner;
};

export function assertSupportedTransactionLifetime(
  transaction: Transaction,
): void {
  if (isTransactionWithDurableNonceLifetime(transaction)) {
    throw new Error(
      "getPhygitalWalletSigner does not support durable nonce transactions; use a recent blockhash lifetime",
    );
  }
}

/**
 * Kit modifying signer for a phygital wallet PDA.
 * Policy soft-denies surface as {@link PolicyDeniedError} before the passkey prompt.
 */
export async function getPhygitalWalletSigner(
  rpc: Rpc<SolanaRpcApi>,
  phygitalTokenPda: Address,
  config?: PhygitalWalletSignerConfig,
): Promise<TransactionModifyingSigner> {
  const [[walletPda], [authorityPda]] = await Promise.all([
    findWalletPda({ phygitalToken: phygitalTokenPda }),
    findAuthorityAccountPda({ phygitalToken: phygitalTokenPda }),
  ]);
  const [authorityAccount, feePayer] = await Promise.all([
    fetchAuthority(rpc, authorityPda),
    config?.feePayer ?? createDefaultFeePayer({ fetch: config?.fetch }),
  ]);

  const executeAccounts = {
    authority: authorityAccount.data.header.authority,
    feePayer,
    authorityAccount,
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
      assertSupportedTransactionLifetime(transaction);

      config?.onPhaseChange?.("preparing");
      const wrapped = await modifyAndWrapWalletTransaction({
        rpc,
        transaction: transaction as Transaction & TransactionWithLifetime,
        walletPda,
        executeAccounts,
        abortSignal: signConfig?.abortSignal,
        onPreview: () => config?.onPhaseChange?.("previewing"),
        authenticate: async (messageHash) => {
          config?.onPhaseChange?.("awaitingPasskey");
          const tap = await authenticatePasskeyForSecp256r1Verify({
            rpc,
            messageHash,
          });
          config?.onPhaseChange?.("building");
          return tap;
        },
        feePayer: async (tx) => {
          config?.onPhaseChange?.("feePaying");
          const [feePayerSignature] =
            await executeAccounts.feePayer.signTransactions([tx], signConfig);
          if (!feePayerSignature) {
            throw new Error("Fee payer returned no signature");
          }
          return feePayerSignature;
        },
      });

      config?.onPhaseChange?.("complete");
      return [wrapped];
    },
  };
}
