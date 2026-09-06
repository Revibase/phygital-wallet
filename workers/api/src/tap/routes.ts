import { Hono } from "hono";

import { mintPossessionToken } from "@/auth/possession-token";
import { json } from "@/shared/http";
import { evaluateCounter } from "@/tap/counter-session";
import {
  readCounterSession,
  writeCounterSession,
} from "@/tap/counter-store";
import { verifyDynamicUrlWithoutCounterCheck } from "@/tap/verify-dynamic-url";

function toUserErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) {
    const msg = err.message.trim();
    if (
      msg.length < 140 &&
      !/[_\-]{2,}|\b(sysvar|u64|PDA|ATA|RPC|D1|KV)\b/i.test(msg)
    ) {
      return msg;
    }
  }
  return fallback;
}

export const verifyTapRoutes = new Hono();

verifyTapRoutes.get("/verify-tap", async (c) => {
  try {
    const params = new URL(c.req.url).searchParams;

    if (!["pk", "s", "c", "n"].every((k) => params.get(k))) {
      return json(
        { isVerified: false, error: "Missing tap parameters" },
        { status: 400 },
      );
    }

    const { isVerified, counter, identifier } =
      verifyDynamicUrlWithoutCounterCheck(params);

    if (!isVerified) {
      return json({ isVerified: false, error: "Invalid signature" }, { status: 400 });
    }

    const state = await readCounterSession(identifier);
    const verdict = evaluateCounter(state, counter);

    if (verdict === "replay") {
      return json(
        {
          isVerified: false,
          error: "This tap timed out. Hold your item here again to verify.",
        },
        { status: 409 },
      );
    }

    await writeCounterSession(identifier, { c: counter });

    let possessionToken: string | undefined;
    let possessionExpiresAt: number | undefined;
    try {
      const minted = await mintPossessionToken({ identifier });
      possessionToken = minted.token;
      possessionExpiresAt = minted.expiresAt;
    } catch {
      /* possession mint is best-effort */
    }

    return json({
      isVerified: true,
      identifier,
      counter,
      ...(possessionToken ? { possessionToken } : {}),
      ...(possessionExpiresAt != null
        ? { possessionExpiresAt }
        : {}),
    });
  } catch (err) {
    return json(
      {
        isVerified: false,
        error: toUserErrorMessage(
          err,
          "Hold flat against the back of your phone and try again.",
        ),
      },
      { status: 400 },
    );
  }
});
