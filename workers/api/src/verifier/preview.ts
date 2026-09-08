import { Hono } from "hono";

import { PENDING_APPROVAL_TTL_MS } from "@/auth/approval-constants";
import { approvalsWatchTicketHead } from "@/auth/approvals-tickets";
import { readDeviceSession } from "@/auth/device-session";
import { mintSignedSessionToken } from "@/auth/session-hmac";
import { json } from "@/shared/http";
import { createLogger } from "@/shared/log";
import type { Instruction } from "@solana/kit";
import { instructionFromJson } from "@/verifier/decode-tx";
import { verifierJsonError } from "@/verifier/errors";
import { tokenSigner } from "@/verifier/token-signer";

/** Soft deny may record DO inbox + mint a visitor watchTicket. */
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

    let watchTicket: string | undefined;
    if (result.soft && result.intentHash) {
      const session = await readDeviceSession(c);
      const { recorded } = await stub.recordSoftDeny({
        intentHash: result.intentHash,
        code: result.code,
        error: result.error,
        details: result.details,
        visitorCredentialId: session?.credentialId ?? null,
      });
      if (recorded) {
        const minted = await mintSignedSessionToken(
          approvalsWatchTicketHead(phygitalToken, result.intentHash),
          PENDING_APPROVAL_TTL_MS,
        );
        watchTicket = minted.token;
        createLogger("api", c.env).debug("approvals.soft_deny", {
          phygitalToken,
          intentHash: result.intentHash,
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
        ...(watchTicket ? { watchTicket } : {}),
      },
      { status: result.httpStatus ?? 200 },
    );
  } catch (err) {
    return verifierJsonError(err, "preview");
  }
});
