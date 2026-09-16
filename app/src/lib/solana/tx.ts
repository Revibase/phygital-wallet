import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  commitmentComparator,
  createTransactionMessage,
  estimateAndSetResourceLimitsFactory,
  estimateResourceLimitsFactory,
  getSignatureFromTransaction,
  getSolanaErrorFromTransactionError,
  pipe,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Blockhash,
  type Commitment,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";

import { getSolanaRpc } from "./rpc";

const CONFIRM_TIMEOUT_MS = 60_000;
const CONFIRM_POLL_MS = 1000;
const CONFIRM_COMMITMENT: Commitment = "confirmed";

/** Match phygital-wallet-sdk wrap — Kit’s estimator uses exact sim units (no headroom). */
const COMPUTE_UNIT_ESTIMATE_MARGIN = 1.1;
const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;
/** v1 loaded-accounts cost model bills in 32 KiB pages. */
const LOADED_ACCOUNTS_PAGE_BYTES = 32 * 1024;

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

function withComputeMargin(unitsConsumed: number): number {
  const tenths = Math.round(COMPUTE_UNIT_ESTIMATE_MARGIN * 10);
  return Math.min(
    MAX_COMPUTE_UNIT_LIMIT,
    Math.max(1, Math.ceil((unitsConsumed * tenths) / 10)),
  );
}

function roundUpLoadedAccountsDataSize(bytes: number): number {
  if (bytes <= 0) return LOADED_ACCOUNTS_PAGE_BYTES;
  return (
    Math.ceil(bytes / LOADED_ACCOUNTS_PAGE_BYTES) * LOADED_ACCOUNTS_PAGE_BYTES
  );
}

let _estimateAndSetResourceLimits: ReturnType<
  typeof estimateAndSetResourceLimitsFactory
> | null = null;

/**
 * Simulate, then set CU / loaded-accounts limits with headroom.
 * Bare Kit estimation uses exact `unitsConsumed`; on-chain can run slightly
 * hotter than sim (claim already includes secp + verify CPI in that sim — the
 * SDK’s +20k buffer is only for authority *preview* sims that omit the passkey).
 */
function estimateAndSetResourceLimits() {
  if (_estimateAndSetResourceLimits) return _estimateAndSetResourceLimits;

  const estimate = estimateResourceLimitsFactory({ rpc: getSolanaRpc() });
  _estimateAndSetResourceLimits = estimateAndSetResourceLimitsFactory(
    async (message, config) => {
      const limits = await estimate(message, config);
      return {
        ...limits,
        computeUnitLimit: withComputeMargin(limits.computeUnitLimit),
        ...("loadedAccountsDataSizeLimit" in limits &&
        limits.loadedAccountsDataSizeLimit != null
          ? {
              loadedAccountsDataSizeLimit: roundUpLoadedAccountsDataSize(
                limits.loadedAccountsDataSizeLimit,
              ),
            }
          : {}),
      };
    },
  );
  return _estimateAndSetResourceLimits;
}

type ConfirmableTransaction = Parameters<
  typeof getSignatureFromTransaction
>[0] & {
  lifetimeConstraint: { lastValidBlockHeight: bigint };
};

/**
 * HTTP-only confirmation. Avoids `@solana/transaction-confirmation`'s websocket
 * path, which can throw a Safari `ReferenceError: Can't find variable: alphabet4`
 * from `@solana/codecs-strings` after the tx has already landed — that false
 * failure was toasting + rolling back optimistic UI.
 */
async function confirmSignatureByPolling(
  signature: ReturnType<typeof getSignatureFromTransaction>,
  lastValidBlockHeight: bigint,
  abortSignal: AbortSignal,
): Promise<void> {
  const rpc = getSolanaRpc();

  while (!abortSignal.aborted) {
    const [{ value: statuses }, blockHeight] = await Promise.all([
      rpc.getSignatureStatuses([signature]).send({ abortSignal }),
      rpc
        .getBlockHeight({ commitment: CONFIRM_COMMITMENT })
        .send({ abortSignal }),
    ]);

    const status = statuses[0];
    if (status?.err) {
      throw getSolanaErrorFromTransactionError(status.err);
    }
    if (
      status?.confirmationStatus &&
      commitmentComparator(status.confirmationStatus, CONFIRM_COMMITMENT) >= 0
    ) {
      return;
    }
    if (blockHeight > lastValidBlockHeight) {
      // One last status check — race between expiry and land.
      const { value: again } = await rpc
        .getSignatureStatuses([signature])
        .send();
      const last = again[0];
      if (last?.err) throw getSolanaErrorFromTransactionError(last.err);
      if (
        last?.confirmationStatus &&
        commitmentComparator(last.confirmationStatus, CONFIRM_COMMITMENT) >= 0
      ) {
        return;
      }
      throw new Error("Transaction expired before confirmation");
    }

    await sleep(CONFIRM_POLL_MS, abortSignal);
  }

  throw abortSignal.reason instanceof Error
    ? abortSignal.reason
    : new Error("Transaction confirmation timed out");
}

function sleep(ms: number, abortSignal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal.aborted) {
      reject(
        abortSignal.reason instanceof Error
          ? abortSignal.reason
          : new Error("Aborted"),
      );
      return;
    }
    const id = setTimeout(resolve, ms);
    abortSignal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(
          abortSignal.reason instanceof Error
            ? abortSignal.reason
            : new Error("Aborted"),
        );
      },
      { once: true },
    );
  });
}

function confirmRecentTransaction() {
  return (transaction: ConfirmableTransaction) => {
    const signature = getSignatureFromTransaction(transaction);
    const abortSignal = AbortSignal.timeout(CONFIRM_TIMEOUT_MS);
    return confirmSignatureByPolling(
      signature,
      transaction.lifetimeConstraint.lastValidBlockHeight,
      abortSignal,
    ).catch(async (error) => {
      // Safety net: if polling/timeout threw but the tx actually landed, succeed.
      try {
        const { value } = await getSolanaRpc()
          .getSignatureStatuses([signature])
          .send();
        const status = value[0];
        if (status?.err) throw getSolanaErrorFromTransactionError(status.err);
        if (
          status?.confirmationStatus &&
          commitmentComparator(status.confirmationStatus, CONFIRM_COMMITMENT) >=
            0
        ) {
          return;
        }
      } catch (statusError) {
        if (statusError !== error) throw statusError;
      }
      throw error;
    });
  };
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
