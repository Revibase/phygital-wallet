import { Hono } from "hono";

import { decodeWireTransaction } from "../decode-tx.js";
import { canSign, signMessage } from "../keys.js";
import { evaluatePolicy } from "../policy.js";

export const signRoutes = new Hono();

/**
 * Co-sign wrapped txs — `createVerifierEndpointSigner` → POST `/sign`.
 * Fee-payer / verifier pubkey in the tx must match this server's key.
 */
signRoutes.post("/sign", async (c) => {
  try {
    const body = (await c.req.json()) as { transactions?: string[] };
    if (!Array.isArray(body.transactions) || body.transactions.length === 0) {
      return c.json(
        {
          error: "transactions required",
          code: "invalid_transaction",
          soft: false,
        },
        400,
      );
    }

    const signatures: string[] = [];
    let kindSeen: "execute" | "config" | null = null;

    for (const wire of body.transactions) {
      const decoded = decodeWireTransaction(wire);

      if (kindSeen && kindSeen !== decoded.kind) {
        return c.json(
          {
            error: "Transaction batch mixes execute with a config change",
            code: "unexpected_instruction",
            soft: false,
          },
          400,
        );
      }
      kindSeen = decoded.kind;

      if (!canSign(decoded.verifier)) {
        return c.json(
          {
            error: "Transaction verifier does not match this signing service",
            code: "verifier_mismatch",
            soft: false,
            details: { got: decoded.verifier },
          },
          403,
        );
      }

      // Execute: re-check standing policy on inner CPIs.
      // Config (set/clear token verifier / recovery wallet): co-sign only.
      if (decoded.kind === "execute") {
        const verdict = evaluatePolicy(decoded.instructions);
        if (!verdict.ok) {
          return c.json(
            {
              error: verdict.error,
              code: verdict.code,
              soft: false,
              details: verdict.details,
            },
            403,
          );
        }
      }

      signatures.push(signMessage(decoded.messageBytes));
    }

    return c.json({ signatures });
  } catch (err) {
    const coded =
      err && typeof err === "object" && "code" in err
        ? (err as { code: string; details?: Record<string, unknown> })
        : null;
    const code = coded?.code ?? "invalid_transaction";
    return c.json(
      {
        error: err instanceof Error ? err.message : "Sign failed",
        code,
        soft: false,
        details: coded?.details,
      },
      code === "verifier_mismatch" ? 403 : 400,
    );
  }
});
