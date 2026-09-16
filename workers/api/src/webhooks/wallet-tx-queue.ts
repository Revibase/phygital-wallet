/**
 * WALLET_TX_QUEUE — buffer between the transaction webhook and downstream work.
 *
 * The producer (`POST /webhooks/transactions`) verifies the delivery and pushes
 * one {@link WalletTxMessage} per transaction, returning fast. This consumer:
 *   1. Indexes wallet activity rows into D1
 *   2. Applies fee credit/debit events to TokenSigner DOs
 *
 * Malformed messages are dropped (acked). D1 or fee-DO failures retry the whole
 * batch (at-least-once; activity and fee events are idempotent).
 */
import { processSubscribeFeeTx } from "@/fees/subscribe-fee-tx";
import { createLogger } from "@/shared/log";
import { runWithRequestStore } from "@/shared/request-context";
import { activityRowsFromResult } from "@/webhooks/wallet-activity";
import {
  storeWalletActivities,
  type WalletActivityItem,
} from "@/webhooks/wallet-activity-store";
import type {
  SubscribeTxResult,
  WalletActivityRow,
} from "@/webhooks/wallet-activity";

/** One enqueued transaction. `result` is the raw Helius subscribe result. */
export type WalletTxMessage = {
  /** Stable event id (`network:commitment:signature`) — idempotency key. */
  id: string;
  signature: string;
  slot: number | null;
  /** Webhook ingestion time, unix seconds — fallback block time. */
  receivedAt: number;
  result: SubscribeTxResult;
};

function isWalletTxMessage(body: unknown): body is WalletTxMessage {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as WalletTxMessage).result === "object" &&
    (body as WalletTxMessage).result !== null
  );
}

/**
 * Queue consumer. Runs inside a request store so `getEnv()` / `getD1()` resolve
 * exactly as they do in the fetch handler.
 */
export async function handleWalletTxQueue(
  batch: MessageBatch<WalletTxMessage>,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  await runWithRequestStore(
    {
      env,
      waitUntil: (promise) => ctx.waitUntil(promise),
    },
    () => processWalletTxBatch(batch, env),
  );
}

async function processWalletTxBatch(
  batch: MessageBatch<WalletTxMessage>,
  env: Env,
): Promise<void> {
  const log = createLogger("api", env);
  const rows: WalletActivityRow[] = [];
  const feeResults: SubscribeTxResult[] = [];

  for (const message of batch.messages) {
    try {
      if (!isWalletTxMessage(message.body)) {
        log.warn("wallet_tx.malformed", { id: message.id });
        message.ack();
        continue;
      }
      const receivedAt =
        typeof message.body.receivedAt === "number"
          ? message.body.receivedAt
          : Date.now() / 1000;
      rows.push(...activityRowsFromResult(message.body.result, receivedAt));
      feeResults.push(message.body.result);
    } catch (err) {
      // A single unparseable payload must not wedge the batch — drop it.
      log.warn("wallet_tx.parse_failed", {
        id: message.id,
        error: err instanceof Error ? err.message : String(err),
      });
      message.ack();
    }
  }

  if (rows.length === 0 && feeResults.length === 0) {
    batch.ackAll();
    return;
  }

  try {
    if (rows.length > 0) {
      // Pass the D1 binding explicitly: the queue entrypoint has no request-scoped
      // AsyncLocalStorage unless we wrap it (we do above); still prefer explicit.
      await storeWalletActivities(env.phygital_token, rows);
    }

    let credited = 0;
    let debited = 0;
    for (const result of feeResults) {
      const fee = await processSubscribeFeeTx(env, result);
      if (fee.credited) credited += 1;
      if (fee.debited) debited += 1;
    }

    log.info("wallet_tx.indexed", {
      messages: batch.messages.length,
      rows: rows.length,
      feeCredited: credited,
      feeDebited: debited,
    });
    batch.ackAll();
  } catch (err) {
    // Transient D1 or DO failure — let the queue redeliver the whole batch.
    log.error("wallet_tx.process_failed", {
      rows: rows.length,
      feeCandidates: feeResults.length,
      error: err instanceof Error ? err.message : String(err),
    });
    batch.retryAll();
  }
}

export type { WalletActivityItem };
