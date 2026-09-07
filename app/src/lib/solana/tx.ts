import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
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

let _sendWithoutConfirming:
  | ReturnType<typeof sendTransactionWithoutConfirmingFactory>
  | null = null;

function sendWithoutConfirming() {
  _sendWithoutConfirming ??= sendTransactionWithoutConfirmingFactory({
    rpc: getSolanaRpc(),
  });
  return _sendWithoutConfirming;
}

type ConfirmableTransaction = Parameters<
  typeof waitForRecentTransactionConfirmation
>[0]["transaction"];

let _confirmRecent: ((transaction: ConfirmableTransaction) => Promise<void>) | null =
  null;

function confirmRecentTransaction() {
  if (_confirmRecent) return _confirmRecent;

  const rpc = getSolanaRpc();
  const rpcSubscriptions = getSolanaRpcSubscriptions();
  const getBlockHeightExceedencePromise = createBlockHeightExceedencePromiseFactory({
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

/** Build an unsigned v0 message (blockhash + fee payer + instructions). */
export async function buildUnsignedTransaction(params: {
  instructions: Instruction[];
  feePayer: TransactionSigner;
}): Promise<UnsignedTransactionMessage> {
  const { value: latestBlockhash } = await getSolanaRpc()
    .getLatestBlockhash()
    .send();

  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(params.feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(params.instructions, m),
  );
}

/** Sign an unsigned message and broadcast. */
export async function signAndSendTransaction(
  unsigned: UnsignedTransactionMessage,
): Promise<SentTransaction> {
  const signedTransaction = await signTransactionMessageWithSigners(unsigned);
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
 * step must not run until the tx has landed (e.g. claim).
 */
export async function sendTransaction(params: {
  instructions: Instruction[];
  feePayer: TransactionSigner;
}): Promise<SentTransaction> {
  const unsigned = await buildUnsignedTransaction(params);
  return signAndSendTransaction(unsigned);
}
