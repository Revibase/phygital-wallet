import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  estimateAndSetResourceLimitsFactory,
  estimateResourceLimitsFactory,
  getSignatureFromTransaction,
  pipe,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Blockhash,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  createBlockHeightExceedencePromiseFactory,
  createRecentSignatureConfirmationPromiseFactory,
  waitForRecentTransactionConfirmation,
} from "@solana/transaction-confirmation";

import { getSolanaRpc, getSolanaRpcSubscriptions } from "./rpc";

const CONFIRM_TIMEOUT_MS = 60_000;

/**
 * Every app transaction is a version 1 transaction message. Unlike legacy / v0,
 * a v1 message with an unset compute-unit limit or loaded-accounts-data-size
 * limit is budgeted **zero** (not the v0 200k/instruction fallback) and fails at
 * execution — so both limits must be set explicitly. The wallet passkey path
 * sets them inside the SDK wrap (`modifyAndWrapWalletTransaction`); direct sends
 * (paymaster-signed authority txs) set them here via `applyResourceLimits`.
 */
const TRANSACTION_VERSION = 1 as const;

/** Placeholder lifetime; wallet modify path refreshes blockhash after NFC. */
const PROVISIONAL_BLOCKHASH = {
  blockhash: "11111111111111111111111111111111" as Blockhash,
  lastValidBlockHeight: 0n,
};

let _sendWithoutConfirming: ReturnType<
  typeof sendTransactionWithoutConfirmingFactory
> | null = null;

function sendWithoutConfirming() {
  _sendWithoutConfirming ??= sendTransactionWithoutConfirmingFactory({
    rpc: getSolanaRpc(),
  });
  return _sendWithoutConfirming;
}

let _estimateAndSetResourceLimits: ReturnType<
  typeof estimateAndSetResourceLimitsFactory
> | null = null;

/** Simulate to fill the v1 compute-unit + loaded-accounts-data-size limits. */
function estimateAndSetResourceLimits() {
  _estimateAndSetResourceLimits ??= estimateAndSetResourceLimitsFactory(
    estimateResourceLimitsFactory({ rpc: getSolanaRpc() }),
  );
  return _estimateAndSetResourceLimits;
}

type ConfirmableTransaction = Parameters<
  typeof waitForRecentTransactionConfirmation
>[0]["transaction"];

let _confirmRecent:
  | ((transaction: ConfirmableTransaction) => Promise<void>)
  | null = null;

function confirmRecentTransaction() {
  if (_confirmRecent) return _confirmRecent;

  const rpc = getSolanaRpc();
  const rpcSubscriptions = getSolanaRpcSubscriptions();
  const getBlockHeightExceedencePromise =
    createBlockHeightExceedencePromiseFactory({
      rpc,
      rpcSubscriptions,
    } as Parameters<typeof createBlockHeightExceedencePromiseFactory>[0]);
  const getRecentSignatureConfirmationPromise =
    createRecentSignatureConfirmationPromiseFactory({
      rpc,
      rpcSubscriptions,
    } as Parameters<typeof createRecentSignatureConfirmationPromiseFactory>[0]);

  _confirmRecent = (transaction) =>
    waitForRecentTransactionConfirmation({
      abortSignal: AbortSignal.timeout(CONFIRM_TIMEOUT_MS),
      commitment: "confirmed",
      getBlockHeightExceedencePromise,
      getRecentSignatureConfirmationPromise,
      transaction,
    });
  return _confirmRecent;
}

export type SentTransaction = {
  signature: string;
  /** Resolves at `confirmed`; rejects if the tx fails or the blockhash expires. */
  confirmed: Promise<void>;
};

export type UnsignedTransactionMessage = Parameters<
  typeof signTransactionMessageWithSigners
>[0];

/** Build an unsigned v1 message (blockhash + fee payer + instructions). */
export async function buildUnsignedTransaction(params: {
  instructions: Instruction[];
  feePayer: TransactionSigner;
  /**
   * When false, use a provisional lifetime (wallet modify path refreshes after NFC).
   * @default true
   */
  fetchBlockhash?: boolean;
}): Promise<UnsignedTransactionMessage> {
  const latestBlockhash =
    params.fetchBlockhash === false
      ? PROVISIONAL_BLOCKHASH
      : (await getSolanaRpc().getLatestBlockhash().send()).value;

  return pipe(
    createTransactionMessage({ version: TRANSACTION_VERSION }),
    (m) => setTransactionMessageFeePayerSigner(params.feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(params.instructions, m),
  );
}

/** Sign an unsigned message and broadcast. */
export async function signAndSendTransaction(
  unsigned: UnsignedTransactionMessage,
  config?: { abortSignal?: AbortSignal },
): Promise<SentTransaction> {
  const signedTransaction = await signTransactionMessageWithSigners(
    unsigned,
    config,
  );
  assertIsTransactionWithBlockhashLifetime(signedTransaction);

  await sendWithoutConfirming()(signedTransaction, { commitment: "confirmed" });

  return {
    signature: getSignatureFromTransaction(signedTransaction),
    confirmed: confirmRecentTransaction()(signedTransaction),
  };
}

/**
 * Sign and broadcast. Returns as soon as the RPC accepts the tx so callers can
 * update UI without waiting for `confirmed`. Await `confirmed` when the next
 * step must not run until the transaction has landed.
 */
export async function sendTransaction(params: {
  instructions: Instruction[];
  feePayer: TransactionSigner;
  fetchBlockhash?: boolean;
  abortSignal?: AbortSignal;
  /**
   * Simulate to fill the v1 compute-unit + loaded-accounts-data-size limits
   * (required — an unset v1 limit is budgeted zero and fails on-chain). Pass
   * true for direct sends. Leave false for the wallet passkey path, whose SDK
   * wrap sets these itself after the accessory tap.
   * @default false
   */
  applyResourceLimits?: boolean;
}): Promise<SentTransaction> {
  const unsigned = await buildUnsignedTransaction(params);
  const prepared = params.applyResourceLimits
    ? await estimateAndSetResourceLimits()(unsigned, {
        abortSignal: params.abortSignal,
      })
    : unsigned;
  return signAndSendTransaction(prepared, {
    abortSignal: params.abortSignal,
  });
}
