/**
 * WALLET_TX_QUEUE — the buffer between the transaction webhook and D1 indexing.
 *
 * The producer (`POST /webhooks/transactions`) verifies the delivery and pushes
 * one {@link WalletTxMessage} per transaction, returning fast. This consumer
 * drains the queue: parse each message into activity rows and batch-write them
 * to D1. Malformed messages are dropped (acked); a D1 write failure retries the
 * whole batch, so indexing is at-least-once and idempotent on (wallet, sig).
 */
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
  ctx: ExecutionContext
): Promise<void> {
  await runWithRequestStore(
    { env, waitUntil: (promise) => ctx.waitUntil(promise) },
    async () => {
      const log = createLogger("api", env);
      const rows: WalletActivityRow[] = [];

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
        } catch (err) {
          // A single unparseable payload must not wedge the batch — drop it.
          log.warn("wallet_tx.parse_failed", {
            id: message.id,
            error: err instanceof Error ? err.message : String(err),
          });
          message.ack();
        }
      }

      if (rows.length === 0) {
        batch.ackAll();
        return;
      }

      try {
        await storeWalletActivities(rows);
      } catch (err) {
        // Transient D1 failure — let the queue redeliver the whole batch.
        log.error("wallet_tx.store_failed", {
          rows: rows.length,
          error: err instanceof Error ? err.message : String(err),
        });
        batch.retryAll();
        return;
      }

      log.info("wallet_tx.indexed", {
        messages: batch.messages.length,
        rows: rows.length,
      });
      batch.ackAll();
    }
  );
}

export type { WalletActivityItem };
