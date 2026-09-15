/**
 * Accessory unlock → browse-unlock cookie.
 *
 * Two ways to prove control of an accessory, each issuing the short-lived
 * `browse_unlock` cookie for the resolved phygital token:
 *
 *   POST /accessory/unlock/tap        { pk, s, c, n }        — NFC dynamic-URL
 *   POST /accessory/unlock/challenge  {}                     — mint a challenge
 *   POST /accessory/unlock/webauthn   { challengeId, response } — WebAuthn tap
 *
 * All three are public (they run before any cookie exists); see PUBLIC_ROUTES.
 * Next.js middleware verifies the cookie locally (same HMAC secret) — no
 * client-side session GET.
 */
import { Hono } from "hono";

import { verifyAccessoryWebauthn } from "@/auth/accessory-verify";
import { issueBrowseUnlockCookie } from "@/auth/browse-unlock-session";
import {
  consumeUnlockChallenge,
  issueUnlockChallenge,
} from "@/auth/unlock-challenge";
import { getErrorMessage } from "@/shared/errors";
import { json } from "@/shared/http";
import { evaluateCounter } from "@/tap/counter-session";
import { readCounterSession, writeCounterSession } from "@/tap/counter-store";
import { resolvePhygitalTokenFromIdentifier } from "@/tap/resolve-token";
import { verifyDynamicUrlWithoutCounterCheck } from "@/tap/verify-dynamic-url";

export const accessoryUnlockRoutes = new Hono<{ Bindings: Env }>();

/** POST /accessory/unlock/tap — verify NFC dynamic-URL tap params. */
accessoryUnlockRoutes.post("/accessory/unlock/tap", async (c) => {
  let body: { pk?: string; s?: string; c?: string | number; n?: string };
  try {
    body = await c.req.json();
  } catch {
    return json({ isVerified: false, error: "Invalid JSON" }, { status: 400 });
  }

  const params = new URLSearchParams();
  for (const k of ["pk", "s", "c", "n"] as const) {
    const v = body[k];
    if (v === undefined || v === null || v === "") {
      return json(
        { isVerified: false, error: "Missing tap parameters" },
        { status: 400 },
      );
    }
    params.set(k, String(v));
  }

  try {
    const { isVerified, counter, identifier } =
      verifyDynamicUrlWithoutCounterCheck(params);
    if (!isVerified) {
      return json(
        { isVerified: false, error: "Invalid signature" },
        { status: 400 },
      );
    }

    const verdict = evaluateCounter(
      await readCounterSession(identifier),
      counter,
    );
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
    const unlock = phygitalToken
      ? await issueBrowseUnlockCookie(c, phygitalToken)
      : null;

    return json({
      isVerified: true,
      counter,
      ...(phygitalToken ? { phygitalToken } : {}),
      ...(unlock ? { expiresAt: unlock.expiresAt } : {}),
    });
  } catch (err) {
    return json(
      {
        isVerified: false,
        error: getErrorMessage(
          err,
          "Hold flat against the back of your phone and try again.",
        ),
      },
      { status: 400 },
    );
  }
});

/** POST /accessory/unlock/challenge — mint a single-use WebAuthn challenge. */
accessoryUnlockRoutes.post("/accessory/unlock/challenge", async (c) => {
  const { challengeId, challenge } = await issueUnlockChallenge();
  return json({ challengeId, challenge });
});

/** POST /accessory/unlock/webauthn — verify a WebAuthn assertion. */
accessoryUnlockRoutes.post("/accessory/unlock/webauthn", async (c) => {
  let body: { challengeId?: string; response?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return json({ isVerified: false, error: "Invalid JSON" }, { status: 400 });
  }

  const challengeId = body.challengeId?.trim();
  if (!challengeId || !body.response) {
    return json(
      { isVerified: false, error: "challengeId and response required" },
      { status: 400 },
    );
  }

  const expectedMessage = await consumeUnlockChallenge(challengeId);
  if (!expectedMessage) {
    return json(
      {
        isVerified: false,
        error: "This unlock request expired. Try again.",
        code: "challenge_invalid",
      },
      { status: 409 },
    );
  }

  const result = await verifyAccessoryWebauthn({
    expectedMessage,
    response: body.response as Parameters<
      typeof verifyAccessoryWebauthn
    >[0]["response"],
  });
  if (!result.ok) {
    return json(
      { isVerified: false, error: result.error },
      { status: result.status },
    );
  }

  const { expiresAt } = await issueBrowseUnlockCookie(c, result.phygitalToken);
  return json({
    isVerified: true,
    phygitalToken: result.phygitalToken,
    expiresAt,
  });
});
