/**
 * POST /preview — authorize instructions against standing policy (soft-deny inbox).
 */
import { Hono } from "hono";
import {
  AccountRole,
  getBase64Encoder,
  type Address,
  type Instruction,
} from "@solana/kit";

import { auditMeta, recordAudit, type AuditEntry } from "@/audit/audit-log";
import { readDeviceSession } from "@/auth/device-session";
import { json } from "@/shared/http";
import { previewJsonError } from "@/verifier/errors";
import { readVerifierBearer } from "@/verifier/require-bearer";
import { tokenSigner } from "@/verifier/token-signer";

const base64Encoder = getBase64Encoder();

function instructionFromJson(raw: {
  programAddress: string;
  accounts?: { address: string; role?: string | number }[];
  data?: string;
}): Instruction {
  const dataB64 = raw.data ?? "";
  const data =
    dataB64.length > 0
      ? new Uint8Array(base64Encoder.encode(dataB64))
      : new Uint8Array();
  const role = (r: string | number | undefined): AccountRole => {
    const n = typeof r === "number" ? r : Number(r);
    if (Number.isInteger(n) && n >= 0 && n <= 3) return n as AccountRole;
    return AccountRole.READONLY;
  };
  return {
    programAddress: raw.programAddress as Address,
    accounts: (raw.accounts ?? []).map((a) => ({
      address: a.address as Address,
      role: role(a.role),
    })),
    data,
  } satisfies Instruction;
}

/** Soft deny may record a DO inbox row for the owner phone. */
export const previewRoutes = new Hono<{ Bindings: Env }>();

previewRoutes.post("/preview", async (c) => {
  const started = Date.now();
  const meta = auditMeta(c);
  try {
    const session = await readVerifierBearer(c);
    if (session instanceof Response) return session;
    const phygitalToken = session.sub;
    const sessionId = session.jti;

    const body = (await c.req.json()) as {
      instructions?: {
        programAddress: string;
        accounts?: { address: string; role?: string | number }[];
        data?: string;
      }[];
    };

    if (!Array.isArray(body.instructions)) {
      return json(
        {
          ok: false,
          code: "invalid_transaction",
          error: "instructions are required",
          soft: false,
        },
        { status: 400 }
      );
    }

    const instructions: Instruction[] =
      body.instructions.map(instructionFromJson);

    const stub = tokenSigner(c.env, phygitalToken);
    const result = await stub.previewAuthorize({
      instructions,
      // Bearer-bound origin — authorizeIntent checks it against allowedOrigins,
      // so /preview surfaces an origin block before the user attempts /sign.
      sessionOrigin: session.origin,
    });

    if (result.ok) {
      recordAudit({
        event: "preview",
        phygitalToken,
        ok: true,
        actor: "accessory",
        intentHash: result.intentHash,
        sessionId,
        origin: meta.origin,
        ms: Date.now() - started,
        requestId: meta.requestId,
      });
      return json({ ok: true, intentHash: result.intentHash });
    }

    const events: AuditEntry[] = [
      {
        event: "preview",
        phygitalToken,
        ok: false,
        code: result.code,
        actor: "accessory",
        intentHash: result.intentHash ?? null,
        sessionId,
        origin: meta.origin,
        detail: { soft: result.soft },
        ms: Date.now() - started,
        requestId: meta.requestId,
      },
    ];

    if (result.soft && result.intentHash) {
      const deviceSession = await readDeviceSession(c);
      const { recorded } = await stub.recordSoftDeny({
        intentHash: result.intentHash,
        code: result.code,
        error: result.error,
        details: result.details,
        visitorCredentialId: deviceSession?.credentialId ?? null,
      });
      if (recorded) {
        // The pending row is raised against the browsing visitor's passkey.
        events.push({
          event: "pending_approval",
          phygitalToken,
          code: result.code,
          actor: "visitor_device",
          intentHash: result.intentHash,
          credentialId: deviceSession?.credentialId ?? null,
          sessionId,
          origin: meta.origin,
          detail: { resolution: "created" },
          requestId: meta.requestId,
        });
      }
    }

    recordAudit(events);

    return json(
      {
        ok: false,
        code: result.code,
        error: result.error,
        soft: result.soft,
        intentHash: result.intentHash,
        details: result.details,
      },
      { status: result.httpStatus ?? 200 }
    );
  } catch (err) {
    recordAudit({
      event: "preview",
      ok: false,
      code: "exception",
      actor: "accessory",
      origin: meta.origin,
      ms: Date.now() - started,
      requestId: meta.requestId,
    });
    return previewJsonError(err);
  }
});
