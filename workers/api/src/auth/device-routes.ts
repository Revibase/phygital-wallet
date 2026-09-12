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

import { auditMeta, recordAudit } from "@/audit/audit-log";
import {
  deleteLinkForToken,
  getCredentialById,
  getCredentialByUserHandle,
  insertCredential,
  listLinksForCredential,
  updateCredentialCounter,
  upsertLink,
  type DeviceTokenLink,
} from "@/auth/device-db";
import { parseUsername } from "@/auth/username";
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
import { requireAppOrigin } from "@/shared/cors";
import { readVerifierBearer } from "@/verifier/require-bearer";
import {
  consumeWebAuthnChallenge,
  resolveWebAuthnRp,
  storeWebAuthnChallenge,
} from "@/auth/webauthn-challenge";
import { json } from "@/shared/http";
import { tokenSigner } from "@/verifier/token-signer";

export const deviceAuthRoutes = new Hono<{ Bindings: Env }>();

async function sessionPayload(credentialId: string, expiresAt: number) {
  const device = await getCredentialById(credentialId);
  if (!device) {
    return null;
  }
  return {
    credentialId,
    expiresAt,
    username: device.userHandle,
  };
}

function mapLinks(links: DeviceTokenLink[]) {
  return links.map((l) => ({
    phygitalToken: l.phygitalToken,
    label: l.label,
    imageUrl: l.imageUrl,
    mint: l.mint,
    linkedAt: l.linkedAt,
  }));
}

deviceAuthRoutes.get("/auth/device-session", async (c) => {
  const session = await ensureDeviceAccessSession(c);
  if (!session) {
    return json(
      {
        error: "Sign in with this phone to continue.",
        code: "device_session_required",
      },
      { status: 401 }
    );
  }
  const payload = await sessionPayload(session.credentialId, session.exp);
  if (!payload) {
    return json(
      {
        error: "Sign in with this phone to continue.",
        code: "device_session_required",
      },
      { status: 401 }
    );
  }
  return json(payload);
});

/** Reissue access (+ rotate refresh) from the refresh cookie. */
deviceAuthRoutes.post("/auth/device-session/refresh", async (c) => {
  const refresh = await readDeviceRefresh(c);
  if (!refresh) {
    return json(
      {
        error: "Sign in with this phone to continue.",
        code: "device_session_required",
      },
      { status: 401 }
    );
  }

  const issued = await issueDeviceSessionCookies(c, refresh.credentialId);
  const payload = await sessionPayload(issued.credentialId, issued.expiresAt);
  if (!payload) {
    return json(
      {
        error: "Sign in with this phone to continue.",
        code: "device_session_required",
      },
      { status: 401 }
    );
  }
  return json(payload);
});

deviceAuthRoutes.get("/auth/device/register-options", async (c) => {
  const parsed = parseUsername(c.req.query("username") ?? "");
  if (!parsed) {
    return json(
      {
        error:
          "Choose a username: 4–15 characters, letters, numbers, and underscores.",
        code: "username_invalid",
      },
      { status: 400 }
    );
  }

  if (await getCredentialByUserHandle(parsed.id)) {
    return json(
      {
        error: "That username is taken. Try another.",
        code: "username_taken",
      },
      { status: 409 }
    );
  }

  const rp = resolveWebAuthnRp(c.req.header("Origin") ?? null);
  if (!rp) {
    return json(
      { error: "Unsupported origin", code: "invalid_transaction" },
      { status: 400 }
    );
  }

  const userHandle = parsed.id;
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpId,
    userName: parsed.display,
    userDisplayName: parsed.display,
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

  return json({ ...options, userHandle, username: parsed.display });
});

deviceAuthRoutes.post("/auth/device", async (c) => {
  try {
    const body = (await c.req.json()) as {
      userHandle?: string;
      credential?: RegistrationResponseJSON;
    };
    const parsedHandle = parseUsername(body.userHandle ?? "");
    if (!parsedHandle || !body.credential) {
      return json(
        {
          error: "userHandle and credential required",
          code: "invalid_transaction",
        },
        { status: 400 }
      );
    }
    const userHandle = parsedHandle.id;

    const rp = resolveWebAuthnRp(c.req.header("Origin") ?? null);
    if (!rp) {
      return json(
        { error: "Unsupported origin", code: "invalid_transaction" },
        { status: 400 }
      );
    }

    const clientData = JSON.parse(
      new TextDecoder().decode(
        isoBase64URL.toBuffer(body.credential.response.clientDataJSON)
      )
    ) as { challenge?: string };
    const challenge = clientData.challenge;
    if (
      !challenge ||
      !(await consumeWebAuthnChallenge("register", userHandle, challenge))
    ) {
      return json(
        { error: "Registration challenge expired", code: "challenge_invalid" },
        { status: 400 }
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
        { status: 400 }
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
        { status: 409 }
      );
    }

    if (await getCredentialByUserHandle(userHandle)) {
      return json(
        {
          error: "That username is taken. Try another.",
          code: "username_taken",
        },
        { status: 409 }
      );
    }

    try {
      await insertCredential({ credentialId, publicKey, userHandle });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/UNIQUE|constraint/i.test(message)) {
        return json(
          {
            error: "That username is taken. Try another.",
            code: "username_taken",
          },
          { status: 409 }
        );
      }
      throw err;
    }

    const issued = await issueDeviceSessionCookies(c, credentialId);
    const links = await listLinksForCredential(credentialId);
    return json({
      enrolled: true,
      credentialId: issued.credentialId,
      expiresAt: issued.expiresAt,
      username: userHandle,
      links: mapLinks(links),
    });
  } catch (err) {
    return json(
      {
        error:
          err instanceof Error ? err.message : "Couldn’t set up this phone",
        code: "device_invalid",
      },
      { status: 400 }
    );
  }
});

deviceAuthRoutes.get("/auth/device-session/options", async (c) => {
  const rp = resolveWebAuthnRp(c.req.header("Origin") ?? null);
  if (!rp) {
    return json(
      { error: "Unsupported origin", code: "invalid_transaction" },
      { status: 400 }
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
        { status: 400 }
      );
    }

    const rp = resolveWebAuthnRp(c.req.header("Origin") ?? null);
    if (!rp) {
      return json(
        { error: "Unsupported origin", code: "invalid_transaction" },
        { status: 400 }
      );
    }

    const clientData = JSON.parse(
      new TextDecoder().decode(
        isoBase64URL.toBuffer(body.credential.response.clientDataJSON)
      )
    ) as { challenge?: string };
    const challenge = clientData.challenge;
    if (
      !challenge ||
      !(await consumeWebAuthnChallenge(
        "auth",
        body.challengeId.trim(),
        challenge
      ))
    ) {
      return json(
        { error: "Sign-in challenge expired", code: "challenge_invalid" },
        { status: 400 }
      );
    }

    const device = await getCredentialById(body.credential.id);
    if (!device) {
      return json(
        { error: "No phone registered", code: "device_not_enrolled" },
        { status: 404 }
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
        { status: 401 }
      );
    }

    await updateCredentialCounter(
      device.credentialId,
      verification.authenticationInfo.newCounter
    );

    const issued = await issueDeviceSessionCookies(c, device.credentialId);
    const links = await listLinksForCredential(device.credentialId);
    return json({
      credentialId: issued.credentialId,
      expiresAt: issued.expiresAt,
      username: device.userHandle,
      links: mapLinks(links),
    });
  } catch (err) {
    return json(
      {
        error: err instanceof Error ? err.message : "Couldn’t sign in",
        code: "device_invalid",
      },
      { status: 400 }
    );
  }
});

deviceAuthRoutes.get("/auth/device/links", async (c) => {
  const session = await requireDeviceSession(c);
  if (session instanceof Response) return session;

  const links = await listLinksForCredential(session.credentialId);
  return json({
    links: mapLinks(links),
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
      { status: 400 }
    );
  }

  // Refresh access from the refresh cookie when the short-lived access expired.
  const session = await ensureDeviceAccessSession(c);
  const browse = await readBrowseUnlock(c);
  const browseUnlocked = Boolean(
    browse && browse.phygitalToken === phygitalToken
  );

  const ownerId = await tokenSigner(
    c.env,
    phygitalToken
  ).getOwnerCredentialId();
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
      ? await sessionPayload(session.credentialId, session.exp)
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
        { status: 400 }
      );
    }

    const origin = c.req.header("Origin") ?? null;
    if (!origin) {
      return json(
        { error: "Unsupported origin", code: "invalid_transaction" },
        { status: 400 }
      );
    }

    // DO createMutationChallenge already rejects linked_elsewhere.
    const result = await tokenSigner(
      c.env,
      phygitalToken
    ).createMutationChallenge({
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
        }
      );
    }
    return json({ challengeId: result.challengeId, options: result.options });
  }
);

deviceAuthRoutes.post("/auth/device/links", async (c) => {
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
      { status: 400 }
    );
  }

  const phygitalToken = body.phygitalToken?.trim();
  if (!phygitalToken) {
    return json(
      { error: "phygitalToken required", code: "invalid_transaction" },
      { status: 400 }
    );
  }

  const origin = c.req.header("Origin") ?? null;
  if (!origin) {
    return json(
      { error: "Unsupported origin", code: "invalid_transaction" },
      { status: 400 }
    );
  }

  if (!body.challengeId?.trim() || !body.assertion) {
    return json(
      {
        error: "challengeId and assertion required",
        code: "invalid_transaction",
      },
      { status: 400 }
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
      { status: 401 }
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
    return json(
      { error: added.error, code: added.code },
      { status: statusCode }
    );
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
      { status: 400 }
    );
  }

  const origin = c.req.header("Origin") ?? null;
  if (!origin) {
    return json(
      { error: "Unsupported origin", code: "invalid_transaction" },
      { status: 400 }
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
      { status: 400 }
    );
  }

  try {
    const stub = tokenSigner(c.env, phygitalToken);
    if (!(await stub.isOwner(session.credentialId))) {
      return json(
        { error: "Not linked on this phone", code: "not_owner" },
        { status: 403 }
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
        { status }
      );
    }

    await deleteLinkForToken(phygitalToken);
    // Inbox cleared inside DO removeOwnerAndClear / clearOwnerAndPolicies.
    recordAudit({
      event: "owner_unlink",
      phygitalToken,
      ok: true,
      actor: "owner_device",
      credentialId: session.credentialId,
      ...auditMeta(c),
    });
    return json({ ok: true });
  } catch (err) {
    return json(
      {
        error: err instanceof Error ? err.message : "Couldn’t unlink",
        code: "unlink_failed",
      },
      { status: 500 }
    );
  }
});

/**
 * Bearer → app-session cookie. The **only** place `browse_unlock` is minted.
 *
 * Accepts a bearer from the token's own verifier — Revibase's or a third
 * party's — because the bearer is asymmetric and its issuer is verified against
 * the token's on-chain verifier set. Restricted to Revibase app origins: this
 * cookie authenticates Revibase app routes only, so a third party calling our
 * verifier never receives one.
 */
deviceAuthRoutes.post("/auth/app-session", async (c) => {
  const forbidden = requireAppOrigin(c);
  if (forbidden) return forbidden;

  const payload = await readVerifierBearer(c);
  if (payload instanceof Response) return payload;

  const { expiresAt } = await issueBrowseUnlockCookie(c, payload.sub);
  return json({ unlocked: true, phygitalToken: payload.sub, expiresAt });
});
