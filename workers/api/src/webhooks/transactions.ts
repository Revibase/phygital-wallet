/**
 * Wallet transaction ingest + activity read.
 *
 *   POST /webhooks/transactions   (from the helius-wallet-service)
 *     Verifies the HMAC-signed delivery, enqueues the transaction onto
 *     WALLET_TX_QUEUE, and returns fast. Parsing/indexing happens in the
 *     queue consumer (`wallet-tx-queue.ts`).
 *
 *   GET  /wallets/:address/activity?limit=&cursor=
 *     Serves the self-indexed activity from D1 in the app's
 *     `{ items, nextCursor }` shape — the drop-in for the Helius activity API.
 */
import { Hono } from "hono";

import { hmacSha256, timingSafeEqual } from "@/auth/session-hmac";
import { json } from "@/shared/http";
import { createLogger } from "@/shared/log";
import { getEnv } from "@/shared/request-context";
import { tryParseAddress } from "@/shared/solana/address";
import { readWalletActivity } from "@/webhooks/wallet-activity-store";
import type { WalletTxMessage } from "@/webhooks/wallet-tx-queue";

export const walletTxRoutes = new Hono<{ Bindings: Env }>();

/** Reject deliveries whose timestamp is more than this far from now. */
const MAX_SKEW_SECONDS = 300;

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase();
  if (clean.length === 0 || clean.length % 2 !== 0) return null;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[i] = byte;
  }
  return bytes;
}

/**
 * Verify `X-Webhook-Signature: sha256=<hex HMAC-SHA256>` over
 * `timestamp + "." + rawBody`, keyed with WALLET_WEBHOOK_SECRET, within skew.
 */
async function verifySignature(
  rawBody: string,
  timestamp: string | null | undefined,
  supplied: string | null | undefined
): Promise<boolean> {
  const secret = getEnv().WALLET_WEBHOOK_SECRET?.trim();
  if (!secret || !timestamp || !supplied) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) return false;

  const suppliedHex = supplied.startsWith("sha256=")
    ? supplied.slice("sha256=".length)
    : supplied;
  const suppliedBytes = hexToBytes(suppliedHex);
  if (!suppliedBytes) return false;

  const expected = await hmacSha256(secret, `${timestamp}.${rawBody}`);
  return timingSafeEqual(expected, suppliedBytes);
}

type WebhookPayload = {
  id?: string;
  signature?: string;
  slot?: number | null;
  receivedAt?: number;
  result?: unknown;
};

walletTxRoutes.post("/webhooks/transactions", async (c) => {
  const log = createLogger("api", c.env);

  // Read raw bytes first — HMAC is over the exact body, not a re-serialization.
  const rawBody = await c.req.text();
  const valid = await verifySignature(
    rawBody,
    c.req.header("X-Webhook-Timestamp") ?? c.req.header("x-webhook-timestamp"),
    c.req.header("X-Webhook-Signature") ?? c.req.header("x-webhook-signature")
  );
  if (!valid) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Signature authenticated the sender; a shape we can't index is not an error
  // worth retrying forever — accept it so the service stops redelivering.
  if (!payload || typeof payload !== "object" || !payload.result) {
    log.warn("wallet_tx.unindexable_payload", { id: payload?.id });
    return json({ ok: true, enqueued: false });
  }

  const idempotencyKey =
    c.req.header("Idempotency-Key") ?? c.req.header("idempotency-key");
  const signature =
    typeof payload.signature === "string" ? payload.signature : "";
  const message: WalletTxMessage = {
    id: idempotencyKey ?? payload.id ?? signature,
    signature,
    slot: typeof payload.slot === "number" ? payload.slot : null,
    receivedAt:
      typeof payload.receivedAt === "number"
        ? payload.receivedAt
        : Date.now() / 1000,
    result: payload.result as WalletTxMessage["result"],
  };

  try {
    await c.env.WALLET_TX_QUEUE.send(message);
  } catch (err) {
    // Failed enqueue → 500 so the service retries; nothing was durably accepted.
    log.error("wallet_tx.enqueue_failed", {
      id: message.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return json({ error: "Enqueue failed" }, { status: 500 });
  }

  return json({ ok: true, enqueued: true });
});

walletTxRoutes.get("/wallets/:address/activity", async (c) => {
  const address = tryParseAddress(c.req.param("address"));
  if (!address) {
    return json({ error: "Invalid wallet address" }, { status: 400 });
  }

  const limitParam = Number(c.req.query("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20;
  const cursor = c.req.query("cursor") ?? null;

  const { items, nextCursor } = await readWalletActivity(c.env.phygital_token, {
    walletAddress: String(address),
    limit,
    cursor,
  });

  return json({ items, nextCursor });
});
