import { address, isSignerRole, type Instruction } from "@solana/kit";
import { Hono } from "hono";
import { findWalletPda } from "phygital-wallet-sdk";

import { instructionFromJson } from "../decode-tx.js";
import { hashIntent } from "../intent-hash.js";
import { evaluatePolicy } from "../policy.js";

export const previewRoutes = new Hono();

async function assertPreviewWalletSigner(
  phygitalToken: string,
  instructions: readonly Instruction[],
): Promise<void> {
  let walletPda: string;
  try {
    const [pda] = await findWalletPda({
      phygitalToken: address(phygitalToken),
    });
    walletPda = String(pda);
  } catch {
    throw Object.assign(new Error("Invalid phygitalToken"), {
      code: "invalid_transaction",
    });
  }

  const isSigner = instructions.some((ix) =>
    (ix.accounts ?? []).some((a) => {
      if (String(a.address) !== walletPda) return false;
      return isSignerRole(a.role);
    }),
  );

  if (!isSigner) {
    throw Object.assign(
      new Error("Preview instructions must include the wallet PDA as a signer"),
      { code: "invalid_transaction", details: { phygitalToken, walletPda } },
    );
  }
}

/**
 * Advisory check before NFC — `previewWalletIntent` in phygital-wallet-sdk.
 * Body instructions only (pre-wrap). Return `{ ok: true }` to proceed.
 */
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
      return c.json(
        {
          ok: false,
          code: "invalid_transaction",
          error: "phygitalToken and instructions are required",
          soft: false,
        },
        400,
      );
    }

    const instructions = body.instructions.map(instructionFromJson);
    await assertPreviewWalletSigner(phygitalToken, instructions);

    const intentHash = await hashIntent(phygitalToken, instructions);
    const verdict = evaluatePolicy(instructions);
    if (!verdict.ok) {
      return c.json({
        ok: false,
        code: verdict.code,
        error: verdict.error,
        soft: false,
        intentHash,
        details: verdict.details,
      });
    }

    return c.json({ ok: true, intentHash });
  } catch (err) {
    const coded =
      err && typeof err === "object" && "code" in err
        ? (err as { code: string; details?: Record<string, unknown> })
        : null;
    return c.json(
      {
        ok: false,
        code: coded?.code ?? "invalid_transaction",
        error: err instanceof Error ? err.message : "Preview failed",
        soft: false,
        details: coded?.details,
      },
      400,
    );
  }
});
