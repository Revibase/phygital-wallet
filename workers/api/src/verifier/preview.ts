/**
 * POST /preview — preflight before NFC / passkey (no co-sign).
 *
 * Soft deny may upsert `pending_approvals` when an owner exists on the DO and
 * this browser is not the owner. Never upsert when unlinked.
 */
import { Hono } from "hono";

import { readDeviceSession } from "@/auth/device-session";
import { upsertPendingApproval } from "@/auth/pending-approvals-db";
import { json } from "@/shared/http";
import type { Instruction } from "phygital-verifier-sdk";
import { instructionFromJson } from "@/verifier/decode-tx";
import { verifierJsonError } from "@/verifier/errors";
import { tokenSigner } from "@/verifier/token-signer";

export const previewRoutes = new Hono<{ Bindings: Env }>();

previewRoutes.post("/preview", async (c) => {
  try {
    const body = (await c.req.json()) as {
      phygitalToken?: string;
      instructions?: {
        programAddress: string;
        accounts?: { address: string; role?: string | number }[];
        data?: string;
      }[];
    };

    const phygitalToken = body.phygitalToken?.trim();
    if (!phygitalToken || !Array.isArray(body.instructions)) {
      return json(
        {
          ok: false,
          code: "invalid_transaction",
          error: "phygitalToken and instructions are required",
          soft: false,
        },
        { status: 400 },
      );
    }

    const instructions: Instruction[] = body.instructions.map(
      instructionFromJson,
    );

    const stub = tokenSigner(c.env, phygitalToken);
    const result = await stub.previewAuthorize({
      instructions,
    });

    if (result.ok) {
      return json({ ok: true, intentHash: result.intentHash });
    }

    if (result.soft && result.intentHash) {
      const ownerId = await stub.getOwnerCredentialId();
      if (ownerId) {
        const session = await readDeviceSession(c);
        if (!session || session.credentialId !== ownerId) {
          await upsertPendingApproval({
            phygitalToken,
            intentHash: result.intentHash,
            code: result.code,
            error: result.error,
            details: result.details,
          });
        }
      }
    }

    return json(
      {
        ok: false,
        code: result.code,
        error: result.error,
        soft: result.soft,
        intentHash: result.intentHash,
        details: result.details,
      },
      { status: result.httpStatus ?? 200 },
    );
  } catch (err) {
    return verifierJsonError(err, "preview");
  }
});
