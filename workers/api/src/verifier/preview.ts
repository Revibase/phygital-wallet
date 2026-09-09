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

import { readDeviceSession } from "@/auth/device-session";
import { json } from "@/shared/http";
import { createLogger } from "@/shared/log";
import { verifierJsonError } from "@/verifier/errors";
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
      const { recorded } = await stub.recordSoftDeny({
        intentHash: result.intentHash,
        code: result.code,
        error: result.error,
        details: result.details,
        visitorCredentialId: session?.credentialId ?? null,
      });
      if (recorded) {
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
      },
      { status: result.httpStatus ?? 200 },
    );
  } catch (err) {
    return verifierJsonError(err, "preview");
  }
});
