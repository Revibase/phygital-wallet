/**
 * POST /sign — proxy to TokenSigner Durable Object.
 *
 * `execute`: fee + standing policy.
 * Config (token verifier / recovery wallet): fee first; owner WebAuthn
 * (`challengeId` + `assertion`) only when the co-signer is a Config default
 * verifier.
 */
import { Hono } from "hono";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

import { json } from "@/shared/http";
import { verifierJsonError } from "@/verifier/errors";
import { readVerifierBearer } from "@/verifier/require-bearer";
import { tokenSigner } from "@/verifier/token-signer";

export const signRoutes = new Hono<{ Bindings: Env }>();

signRoutes.post("/sign", async (c) => {
  try {
    const session = await readVerifierBearer(c);
    if (session instanceof Response) return session;
    const phygitalToken = session.sub;

    const body = (await c.req.json()) as {
      transactions?: string[];
      challengeId?: string;
      assertion?: AuthenticationResponseJSON;
    };
    if (!Array.isArray(body.transactions) || body.transactions.length === 0) {
      return json(
        { error: "transactions required", code: "invalid_transaction" },
        { status: 400 },
      );
    }

    const result = await tokenSigner(c.env, phygitalToken).signTransactions(
      body.transactions,
      {
        challengeId: body.challengeId ?? null,
        assertion: body.assertion ?? null,
        origin: c.req.header("Origin") ?? null,
      },
    );
    if (!result.ok) {
      return json(result.body, { status: result.status });
    }
    return json({ signatures: result.signatures });
  } catch (err) {
    return verifierJsonError(err);
  }
});
