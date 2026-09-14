/**
 * POST /sign — fee-sponsor an on-chain `execute` transaction.
 *
 * Policy is enforced on-chain, so this endpoint is bearer-free: the api routes
 * to the token's TokenSigner DO (derived from the tx), which validates the tx
 * shape, meters the prepaid fee balance, and co-signs as the fee payer.
 */
import { Hono } from "hono";

import { auditMeta, recordAudit } from "@/audit/audit-log";
import { json } from "@/shared/http";
import { verifierJsonError } from "@/transactions/errors";
import { tokenSigner } from "@/transactions/token-signer";
import { decodeWireTransaction } from "./decode-tx";

export const signRoutes = new Hono<{ Bindings: Env }>();

signRoutes.post("/sign", async (c) => {
  const started = Date.now();
  const meta = auditMeta(c);
  let phygitalToken: string | null = null;
  try {
    const body = (await c.req.json()) as {
      transactions?: string[];
    };
    if (!Array.isArray(body.transactions) || body.transactions.length === 0) {
      return json(
        { error: "transactions required", code: "invalid_transaction" },
        { status: 400 },
      );
    }

    ({ phygitalToken } = decodeWireTransaction(body.transactions[0]!));
    if (!phygitalToken) {
      return json(
        {
          error: "Transaction missing phygital-wallet execute instruction",
          code: "unexpected_instruction",
        },
        { status: 400 },
      );
    }

    const result = await tokenSigner(c.env, phygitalToken).signTransactions(
      body.transactions,
    );

    recordAudit({
      event: "sign",
      phygitalToken,
      ok: result.ok,
      actor: "accessory",
      origin: meta.origin,
      detail: result.ok
        ? { feePayer: result.audit?.feePayer, count: result.signatures.length }
        : null,
      ms: Date.now() - started,
      requestId: meta.requestId,
    });

    if (!result.ok) {
      return json(result.body, { status: result.status });
    }
    return json({ signatures: result.signatures });
  } catch (err) {
    recordAudit({
      event: "sign",
      phygitalToken,
      ok: false,
      actor: "accessory",
      code: "exception",
      origin: meta.origin,
      ms: Date.now() - started,
      requestId: meta.requestId,
    });
    return verifierJsonError(err);
  }
});
