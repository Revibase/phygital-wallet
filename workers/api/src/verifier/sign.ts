/**
 * POST /sign — proxy to TokenSigner Durable Object.
 *
 * `execute`: fee + standing policy.
 * Config (token verifier / recovery wallet): fee first; owner WebAuthn
 * (`challengeId` + `assertion`) only when the co-signer is a Config default
 * verifier.
 */
import { Hono } from "hono";

import { auditMeta, recordAudit, type AuditEntry } from "@/audit/audit-log";
import { json } from "@/shared/http";
import { verifierJsonError } from "@/verifier/errors";
import { readVerifierBearer } from "@/verifier/require-bearer";
import { tokenSigner } from "@/verifier/token-signer";

export const signRoutes = new Hono<{ Bindings: Env }>();

/** Map a config-change action to its dedicated audit event. */
function configChangeEvent(
  action: string
): "token_verifier_change" | "recovery_wallet_set" | null {
  if (action === "set_token_verifier" || action === "clear_token_verifier") {
    return "token_verifier_change";
  }
  if (action === "set_recovery_wallet" || action === "clear_recovery_wallet") {
    return "recovery_wallet_set";
  }
  return null;
}

signRoutes.post("/sign", async (c) => {
  const started = Date.now();
  const meta = auditMeta(c);
  let phygitalToken: string | null = null;
  try {
    const session = await readVerifierBearer(c);
    if (session instanceof Response) return session;
    phygitalToken = session.sub;
    const sessionId = session.jti;

    const body = (await c.req.json()) as {
      transactions?: string[];
    };
    if (!Array.isArray(body.transactions) || body.transactions.length === 0) {
      return json(
        { error: "transactions required", code: "invalid_transaction" },
        { status: 400 }
      );
    }

    const result = await tokenSigner(c.env, phygitalToken).signTransactions(
      body.transactions,
      {
        // Bearer-bound origin (require-bearer already verified it === request
        // Origin). The single trusted origin, enforced against the standing
        // policy's allowedOrigins inside authorizeIntent.
        sessionOrigin: session.origin,
      }
    );

    const audit = result.ok ? result.audit : undefined;
    // Prefer the execute intent hash the DO surfaces on success; on failure it
    // rides along in the error details.
    const intentHash = result.ok
      ? audit?.intentHash ?? null
      : typeof result.body.details?.intentHash === "string"
      ? result.body.details.intentHash
      : null;

    const events: AuditEntry[] = [
      {
        event: "sign",
        phygitalToken,
        ok: result.ok,
        actor: "accessory",
        code: result.ok ? null : result.body.code,
        verifier: audit?.verifier ?? null,
        intentHash,
        sessionId,
        origin: meta.origin,
        detail: audit
          ? { kind: audit.kind, signatureCount: audit.signatureCount }
          : null,
        ms: Date.now() - started,
        requestId: meta.requestId,
      },
    ];

    if (audit?.kind === "config" && audit.configAction) {
      const event = configChangeEvent(audit.configAction);
      if (event) {
        events.push({
          event,
          phygitalToken,
          ok: true,
          actor: "accessory",
          verifier: audit.verifier,
          sessionId,
          origin: meta.origin,
          detail: { action: audit.configAction },
          requestId: meta.requestId,
        });
      }
    }

    recordAudit(events);

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
