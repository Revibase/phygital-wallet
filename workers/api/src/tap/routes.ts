import { Hono } from "hono";

import { issueBrowseUnlockCookie } from "@/auth/browse-unlock-session";
import { json } from "@/shared/http";
import { resolvePhygitalTokenFromIdentifier } from "@/tap/resolve-token";
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

    const phygitalToken =
      await resolvePhygitalTokenFromIdentifier(identifier);
    if (phygitalToken) {
      await issueBrowseUnlockCookie(c, phygitalToken);
    }

    return json({
      isVerified: true,
      identifier,
      counter,
      ...(phygitalToken ? { phygitalToken } : {}),
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
