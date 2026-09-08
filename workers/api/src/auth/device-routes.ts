/**
 * Device identity — platform passkey register / login + token links.
 * Access cookie is credential-scoped; refresh cookie reissues access.
 */
import { Hono } from "hono";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

const textEncoder = new TextEncoder();

import {
  deleteLinkForToken,
  getCredentialById,
  insertCredential,
  listLinksForCredential,
  updateCredentialCounter,
  upsertLink,
} from "@/auth/device-db";
import {
  ensureDeviceAccessSession,
  issueDeviceSessionCookies,
  readDeviceRefresh,
  requireDeviceSession,
} from "@/auth/device-session";
import {
  issueBrowseUnlockCookie,
  readBrowseUnlock,
} from "@/auth/browse-unlock-session";
import { verifyAccessoryAndResolveToken } from "@/auth/accessory-verify";
import { denyIfAuthRateLimited } from "@/auth/rate-limit";
import {
  consumeWebAuthnChallenge,
  resolveWebAuthnRp,
  storeWebAuthnChallenge,
} from "@/auth/webauthn-challenge";
import { json } from "@/shared/http";
import { tokenSigner } from "@/verifier/token-signer";

export const deviceAuthRoutes = new Hono<{ Bindings: Env }>();

deviceAuthRoutes.get("/auth/device-session", async (c) => {
  const session = await ensureDeviceAccessSession(c);
  if (!session) {
    return json(
      {
        error: "Sign in with this phone to continue.",
        code: "device_session_required",
      },
      { status: 401 },
    );
  }
  return json({
    credentialId: session.credentialId,
    expiresAt: session.exp,
  });
});

/** Reissue access (+ rotate refresh) from the refresh cookie. */
deviceAuthRoutes.post("/auth/device-session/refresh", async (c) => {
  const limited = await denyIfAuthRateLimited(c, "login");
  if (limited) return limited;

  const refresh = await readDeviceRefresh(c);
  if (!refresh) {
    return json(
      {
        error: "Sign in with this phone to continue.",
        code: "device_session_required",
      },
      { status: 401 },
    );
  }

  const issued = await issueDeviceSessionCookies(c, refresh.credentialId);
  return json({
    credentialId: issued.credentialId,
    expiresAt: issued.expiresAt,
  });
});

deviceAuthRoutes.get("/auth/device/register-options", async (c) => {
  const limited = await denyIfAuthRateLimited(c, "register");
  if (limited) return limited;

  const rp = resolveWebAuthnRp(c.req.header("Origin") ?? null);
  if (!rp) {
    return json(
      { error: "Unsupported origin", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const userHandle = crypto.randomUUID();
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpId,
    userName: `Revibase Owner's Key`,
    userDisplayName: "Revibase",
    userID: new Uint8Array(textEncoder.encode(userHandle)),
    attestationType: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "required",
      requireResidentKey: true,
    },
    supportedAlgorithmIDs: [-7, -257],
  });
  await storeWebAuthnChallenge("register", userHandle, options.challenge);

  return json({ ...options, userHandle });
});

deviceAuthRoutes.post("/auth/device", async (c) => {
  const limited = await denyIfAuthRateLimited(c, "register");
  if (limited) return limited;

  try {
    const body = (await c.req.json()) as {
      userHandle?: string;
      credential?: RegistrationResponseJSON;
    };
    const userHandle = body.userHandle?.trim();
    if (!userHandle || !body.credential) {
      return json(
        {
          error: "userHandle and credential required",
          code: "invalid_transaction",
        },
        { status: 400 },
      );
    }

    const rp = resolveWebAuthnRp(c.req.header("Origin") ?? null);
    if (!rp) {
      return json(
        { error: "Unsupported origin", code: "invalid_transaction" },
        { status: 400 },
      );
    }

    const clientData = JSON.parse(
      new TextDecoder().decode(
        isoBase64URL.toBuffer(body.credential.response.clientDataJSON),
      ),
    ) as { challenge?: string };
    const challenge = clientData.challenge;
    if (
      !challenge ||
      !(await consumeWebAuthnChallenge("register", userHandle, challenge))
    ) {
      return json(
        { error: "Registration challenge expired", code: "challenge_invalid" },
        { status: 400 },
      );
    }

    const verification = await verifyRegistrationResponse({
      response: body.credential,
      expectedChallenge: challenge,
      expectedOrigin: rp.expectedOrigin,
      expectedRPID: rp.rpId,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return json(
        { error: "Couldn’t verify this phone", code: "device_invalid" },
        { status: 400 },
      );
    }

    const { credential } = verification.registrationInfo;
    const credentialId = credential.id;
    const publicKey = isoBase64URL.fromBuffer(credential.publicKey);

    if (await getCredentialById(credentialId)) {
      return json(
        {
          error: "This phone is already registered",
          code: "device_already_enrolled",
        },
        { status: 409 },
      );
    }

    await insertCredential({ credentialId, publicKey, userHandle });

    const issued = await issueDeviceSessionCookies(c, credentialId);
    const links = await listLinksForCredential(credentialId);
    return json({
      enrolled: true,
      expiresAt: issued.expiresAt,
      credentialId: issued.credentialId,
      links: links.map((l) => ({
        phygitalToken: l.phygitalToken,
        label: l.label,
        imageUrl: l.imageUrl,
        mint: l.mint,
        linkedAt: l.linkedAt,
      })),
    });
  } catch (err) {
    return json(
      {
        error: err instanceof Error ? err.message : "Couldn’t set up this phone",
        code: "device_invalid",
      },
      { status: 400 },
    );
  }
});

deviceAuthRoutes.get("/auth/device-session/options", async (c) => {
  const limited = await denyIfAuthRateLimited(c, "login");
  if (limited) return limited;

  const rp = resolveWebAuthnRp(c.req.header("Origin") ?? null);
  if (!rp) {
    return json(
      { error: "Unsupported origin", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const challengeId = crypto.randomUUID();
  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    userVerification: "required",
  });
  await storeWebAuthnChallenge("auth", challengeId, options.challenge);

  return json({ ...options, challengeId });
});

deviceAuthRoutes.post("/auth/device-session", async (c) => {
  const limited = await denyIfAuthRateLimited(c, "login");
  if (limited) return limited;

  try {
    const body = (await c.req.json()) as {
      challengeId?: string;
      credential?: AuthenticationResponseJSON;
    };
    if (!body.challengeId?.trim() || !body.credential) {
      return json(
        {
          error: "challengeId and credential required",
          code: "invalid_transaction",
        },
        { status: 400 },
      );
    }

    const rp = resolveWebAuthnRp(c.req.header("Origin") ?? null);
    if (!rp) {
      return json(
        { error: "Unsupported origin", code: "invalid_transaction" },
        { status: 400 },
      );
    }

    const clientData = JSON.parse(
      new TextDecoder().decode(
        isoBase64URL.toBuffer(body.credential.response.clientDataJSON),
      ),
    ) as { challenge?: string };
    const challenge = clientData.challenge;
    if (
      !challenge ||
      !(await consumeWebAuthnChallenge(
        "auth",
        body.challengeId.trim(),
        challenge,
      ))
    ) {
      return json(
        { error: "Sign-in challenge expired", code: "challenge_invalid" },
        { status: 400 },
      );
    }

    const device = await getCredentialById(body.credential.id);
    if (!device) {
      return json(
        { error: "No phone registered", code: "device_not_enrolled" },
        { status: 404 },
      );
    }

    const verification = await verifyAuthenticationResponse({
      response: body.credential,
      expectedChallenge: challenge,
      expectedOrigin: rp.expectedOrigin,
      expectedRPID: rp.rpId,
      requireUserVerification: true,
      credential: {
        id: device.credentialId,
        publicKey: isoBase64URL.toBuffer(device.publicKey),
        counter: device.counter,
        transports: ["internal"],
      },
    });

    if (!verification.verified) {
      return json(
        { error: "Couldn’t sign in", code: "device_invalid" },
        { status: 401 },
      );
    }

    await updateCredentialCounter(
      device.credentialId,
      verification.authenticationInfo.newCounter,
    );

    const issued = await issueDeviceSessionCookies(c, device.credentialId);
    const links = await listLinksForCredential(device.credentialId);
    return json({
      expiresAt: issued.expiresAt,
      credentialId: issued.credentialId,
      links: links.map((l) => ({
        phygitalToken: l.phygitalToken,
        label: l.label,
        imageUrl: l.imageUrl,
        mint: l.mint,
        linkedAt: l.linkedAt,
      })),
    });
  } catch (err) {
    return json(
      {
        error: err instanceof Error ? err.message : "Couldn’t sign in",
        code: "device_invalid",
      },
      { status: 400 },
    );
  }
});

deviceAuthRoutes.get("/auth/device/links", async (c) => {
  const session = await requireDeviceSession(c);
  if (session instanceof Response) return session;

  const links = await listLinksForCredential(session.credentialId);
  return json({
    links: links.map((l) => ({
      phygitalToken: l.phygitalToken,
      label: l.label,
      imageUrl: l.imageUrl,
      mint: l.mint,
      linkedAt: l.linkedAt,
    })),
  });
});

/**
 * Token home gate: session + browse unlock + link status + claimed
 * in one round-trip (one DO owner read).
 */
deviceAuthRoutes.get("/auth/device/gate", async (c) => {
  const phygitalToken = c.req.query("phygitalToken")?.trim();
  if (!phygitalToken) {
    return json(
      { error: "phygitalToken required", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  // Refresh access from the refresh cookie when the short-lived access expired.
  const session = await ensureDeviceAccessSession(c);
  const browse = await readBrowseUnlock(c);
  const browseUnlocked = Boolean(
    browse && browse.phygitalToken === phygitalToken,
  );

  const ownerId = await tokenSigner(c.env, phygitalToken).getOwnerCredentialId();
  const claimed = Boolean(ownerId);
  const linkStatus = session
    ? !ownerId
      ? ("unlinked" as const)
      : ownerId === session.credentialId
        ? ("linked_here" as const)
        : ("linked_elsewhere" as const)
    : null;

  return json({
    session: session
      ? { credentialId: session.credentialId, expiresAt: session.exp }
      : null,
    browseUnlocked,
    linkStatus,
    claimed,
    phygitalToken,
  });
});

deviceAuthRoutes.post(
  "/auth/device/links/:phygitalToken/mutation-options",
  async (c) => {
    const session = await requireDeviceSession(c);
    if (session instanceof Response) return session;

    const phygitalToken = c.req.param("phygitalToken")?.trim();
    if (!phygitalToken) {
      return json(
        { error: "phygitalToken required", code: "invalid_transaction" },
        { status: 400 },
      );
    }

    const origin = c.req.header("Origin") ?? null;
    if (!origin) {
      return json(
        { error: "Unsupported origin", code: "invalid_transaction" },
        { status: 400 },
      );
    }

    // DO createMutationChallenge already rejects linked_elsewhere.
    const result = await tokenSigner(c.env, phygitalToken).createMutationChallenge({
      origin,
      binding: { kind: "addOwner", credentialId: session.credentialId },
    });
    if (!result.ok) {
      return json(
        { error: result.error, code: result.code },
        {
          status:
            result.code === "linked_elsewhere"
              ? 409
              : result.code === "not_owner"
                ? 403
                : 400,
        },
      );
    }
    return json({ challengeId: result.challengeId, options: result.options });
  },
);

deviceAuthRoutes.post("/auth/device/links", async (c) => {
  const limited = await denyIfAuthRateLimited(c, "link");
  if (limited) return limited;

  const session = await requireDeviceSession(c);
  if (session instanceof Response) return session;

  let body: {
    phygitalToken?: string;
    label?: string;
    imageUrl?: string;
    mint?: string;
    challengeId?: string;
    assertion?: AuthenticationResponseJSON;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return json(
      { error: "Invalid JSON body", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const phygitalToken = body.phygitalToken?.trim();
  if (!phygitalToken) {
    return json(
      { error: "phygitalToken required", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const origin = c.req.header("Origin") ?? null;
  if (!origin) {
    return json(
      { error: "Unsupported origin", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  if (!body.challengeId?.trim() || !body.assertion) {
    return json(
      {
        error: "challengeId and assertion required",
        code: "invalid_transaction",
      },
      { status: 400 },
    );
  }

  // DO addOwner is idempotent for the same credential and rejects linked_elsewhere.
  const credential = await getCredentialById(session.credentialId);
  if (!credential) {
    return json(
      {
        error: "Sign in with this phone to continue.",
        code: "device_session_required",
      },
      { status: 401 },
    );
  }

  const added = await tokenSigner(c.env, phygitalToken).addOwner({
    credentialId: session.credentialId,
    publicKey: credential.publicKey,
    label: body.label ?? null,
    imageUrl: body.imageUrl ?? null,
    mint: body.mint ?? null,
    challengeId: body.challengeId.trim(),
    assertion: body.assertion,
    origin,
  });
  if (!added.ok) {
    const statusCode =
      added.code === "linked_elsewhere"
        ? 409
        : added.code === "challenge_invalid"
          ? 400
          : 403;
    return json({ error: added.error, code: added.code }, { status: statusCode });
  }

  await upsertLink({
    credentialId: session.credentialId,
    phygitalToken,
    label: body.label ?? null,
    imageUrl: body.imageUrl ?? null,
    mint: body.mint ?? null,
  });

  return json({ status: "linked_here", phygitalToken });
});

deviceAuthRoutes.delete("/auth/device/links/:phygitalToken", async (c) => {
  const session = await requireDeviceSession(c);
  if (session instanceof Response) return session;

  const phygitalToken = c.req.param("phygitalToken")?.trim();
  if (!phygitalToken) {
    return json(
      { error: "phygitalToken required", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const origin = c.req.header("Origin") ?? null;
  if (!origin) {
    return json(
      { error: "Unsupported origin", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    challengeId?: string;
    assertion?: AuthenticationResponseJSON;
  };
  if (!body.challengeId || !body.assertion) {
    return json(
      {
        error: "challengeId and assertion required",
        code: "invalid_transaction",
      },
      { status: 400 },
    );
  }

  try {
    const stub = tokenSigner(c.env, phygitalToken);
    if (!(await stub.isOwner(session.credentialId))) {
      return json(
        { error: "Not linked on this phone", code: "not_owner" },
        { status: 403 },
      );
    }

    const cleared = await stub.removeOwnerAndClear({
      challengeId: body.challengeId,
      assertion: body.assertion,
      origin,
    });
    if (!cleared.ok) {
      const status =
        cleared.code === "teardown_required"
          ? 409
          : cleared.code === "challenge_invalid"
            ? 400
            : 403;
      return json(
        {
          error: cleared.error,
          code: cleared.code,
          details: "details" in cleared ? cleared.details : undefined,
        },
        { status },
      );
    }

    await deleteLinkForToken(phygitalToken);
    // Inbox cleared inside DO removeOwnerAndClear / clearOwnerAndPolicies.
    return json({ ok: true });
  } catch (err) {
    return json(
      {
        error: err instanceof Error ? err.message : "Couldn’t unlink",
        code: "unlink_failed",
      },
      { status: 500 },
    );
  }
});

/** Accessory Hold → mint browse-unlock cookie. */
deviceAuthRoutes.post("/auth/browse-unlock", async (c) => {
  let body: {
    message?: string;
    response?: Parameters<
      typeof verifyAccessoryAndResolveToken
    >[0]["response"];
    phygitalToken?: string;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return json(
      { error: "Invalid JSON body", code: "invalid_transaction" },
      { status: 400 },
    );
  }
  if (!body.message?.trim() || !body.response) {
    return json(
      {
        error: "message and response required",
        code: "invalid_transaction",
      },
      { status: 400 },
    );
  }

  const verified = await verifyAccessoryAndResolveToken({
    message: body.message.trim(),
    response: body.response,
  });
  if (!verified.ok) {
    return json(
      { error: verified.error, code: "passkey_invalid" },
      { status: verified.status },
    );
  }

  const expected = body.phygitalToken?.trim();
  if (expected && expected !== verified.phygitalToken) {
    return json(
      { error: "That isn’t the same accessory.", code: "passkey_invalid" },
      { status: 403 },
    );
  }

  const { expiresAt } = await issueBrowseUnlockCookie(
    c,
    verified.phygitalToken,
  );
  return json({
    unlocked: true,
    phygitalToken: verified.phygitalToken,
    expiresAt,
  });
});
