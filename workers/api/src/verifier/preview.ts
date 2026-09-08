/**
 * POST /preview — preflight before NFC / passkey (no co-sign).
 *
 * Soft deny may upsert `pending_approvals` when the token is claimed (D1 link
 * index) and this browser is not the linked owner phone. Never upsert when
 * unlinked. Uses D1 for claim/owner checks so soft-deny is one DO round-trip.
 */
import { Hono } from "hono";

import { readDeviceSession } from "@/auth/device-session";
import { listLinksForToken } from "@/auth/device-db";
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
      const session = await readDeviceSession(c);
      const links = await listLinksForToken(phygitalToken);
      const linkedHere = Boolean(
        session &&
          links.some((link) => link.credentialId === session.credentialId),
      );
      if (!linkedHere && links.length > 0) {
        await upsertPendingApproval({
          phygitalToken,
          intentHash: result.intentHash,
          code: result.code,
          error: result.error,
          details: result.details,
        });
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
