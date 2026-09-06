/**
 * Device identity — platform passkey register / login + token links.
 * App session cookie is credential-scoped (not per-token).
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
  deleteLink,
  getCredentialById,
  getLinkStatus,
  insertCredential,
  insertLink,
  isTokenClaimed,
  listLinksForCredential,
  updateCredentialCounter,
} from "@/auth/device-db";
import {
  mintDeviceSessionToken,
  readDeviceSession,
  requireDeviceSession,
  setDeviceSessionCookie,
} from "@/auth/device-session";
import {
  type AuthenticationResponseJSON as AccessoryAuthResponse,
  resolveTokenFromPasskeyPubkey,
  verifyPasskeyAndResolveToken,
} from "@/auth/passkey-verify";
import { consumePossessionToken } from "@/auth/possession-token";
import { denyIfAuthRateLimited } from "@/auth/rate-limit";
import {
  consumeWebAuthnChallenge,
  resolveWebAuthnRp,
  storeWebAuthnChallenge,
} from "@/auth/webauthn-challenge";
import { json } from "@/shared/http";
import { deletePolicyDocument } from "@/verifier/policy-db";
import { unlinkOwnerAndResetPolicy } from "@/auth/unlink-owner";

export const deviceAuthRoutes = new Hono();

deviceAuthRoutes.get("/auth/device-session", async (c) => {
  const session = await readDeviceSession(c);
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

    const { token, expiresAt } = await mintDeviceSessionToken({ credentialId });
    setDeviceSessionCookie(c, token, expiresAt);

    return json({ enrolled: true, expiresAt, credentialId });
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

    const { token, expiresAt } = await mintDeviceSessionToken({
      credentialId: device.credentialId,
    });
    setDeviceSessionCookie(c, token, expiresAt);

    return json({ expiresAt, credentialId: device.credentialId });
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

deviceAuthRoutes.get("/auth/device/links/claimed", async (c) => {
  const limited = await denyIfAuthRateLimited(c, "claimed");
  if (limited) return limited;

  const phygitalToken = c.req.query("phygitalToken")?.trim();
  if (!phygitalToken) {
    return json(
      { error: "phygitalToken required", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const claimed = await isTokenClaimed(phygitalToken);
  return json({ claimed, phygitalToken });
});

deviceAuthRoutes.get("/auth/device/links/status", async (c) => {
  const session = await requireDeviceSession(c);
  if (session instanceof Response) return session;

  const phygitalToken = c.req.query("phygitalToken")?.trim();
  if (!phygitalToken) {
    return json(
      { error: "phygitalToken required", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const status = await getLinkStatus(session.credentialId, phygitalToken);
  return json({ status, phygitalToken });
});

deviceAuthRoutes.post("/auth/device/links", async (c) => {
  const limited = await denyIfAuthRateLimited(c, "link");
  if (limited) return limited;

  try {
    const session = await requireDeviceSession(c);
    if (session instanceof Response) return session;

    const body = (await c.req.json()) as {
      phygitalToken?: string;
      possessionToken?: string;
      accessory?: { message?: string; response?: AccessoryAuthResponse };
      label?: string;
      imageUrl?: string;
      mint?: string;
    };

    const phygitalToken = body.phygitalToken?.trim();
    if (!phygitalToken) {
      return json(
        { error: "phygitalToken required", code: "invalid_transaction" },
        { status: 400 },
      );
    }

    const status = await getLinkStatus(session.credentialId, phygitalToken);
    if (status === "linked_here") {
      return json({ status: "linked_here", phygitalToken });
    }
    if (status === "linked_elsewhere") {
      return json(
        {
          error: "This accessory is linked to another phone.",
          code: "linked_elsewhere",
        },
        { status: 409 },
      );
    }

    if (body.possessionToken) {
      const proof = await consumePossessionToken(body.possessionToken);
      if (!proof) {
        return json(
          {
            error: "Possession expired. Hold your item again.",
            code: "possession_invalid",
          },
          { status: 400 },
        );
      }
      const pda = await resolveTokenFromPasskeyPubkey(proof.secp256r1PublicKey);
      if (pda && pda !== phygitalToken) {
        return json(
          { error: "That isn’t the same accessory.", code: "passkey_invalid" },
          { status: 403 },
        );
      }
    } else if (body.accessory?.message && body.accessory.response) {
      const verified = await verifyPasskeyAndResolveToken({
        message: body.accessory.message,
        response: body.accessory.response,
      });
      if (!verified.ok) {
        return json(
          { error: verified.error, code: "passkey_invalid" },
          { status: verified.status },
        );
      }
      if (verified.phygitalToken !== phygitalToken) {
        return json(
          { error: "That isn’t the same accessory.", code: "passkey_invalid" },
          { status: 403 },
        );
      }
    } else {
      return json(
        {
          error: "possessionToken or accessory hold required",
          code: "invalid_transaction",
        },
        { status: 400 },
      );
    }

    try {
      await insertLink({
        credentialId: session.credentialId,
        phygitalToken,
        label: body.label ?? null,
        imageUrl: body.imageUrl ?? null,
        mint: body.mint ?? null,
      });
    } catch {
      const again = await getLinkStatus(session.credentialId, phygitalToken);
      if (again === "linked_elsewhere") {
        return json(
          {
            error: "This accessory is linked to another phone.",
            code: "linked_elsewhere",
          },
          { status: 409 },
        );
      }
      if (again === "linked_here") {
        return json({ status: "linked_here", phygitalToken });
      }
      throw new Error("Couldn’t link this accessory");
    }

    return json({ status: "linked_here", phygitalToken });
  } catch (err) {
    return json(
      {
        error:
          err instanceof Error ? err.message : "Couldn’t link this accessory",
        code: "device_invalid",
      },
      { status: 400 },
    );
  }
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

  const ok = await unlinkOwnerAndResetPolicy({
    deleteLink: () => deleteLink(session.credentialId, phygitalToken),
    deletePolicy: () => deletePolicyDocument(phygitalToken),
  });
  if (!ok) {
    return json(
      { error: "Not linked on this phone", code: "not_owner" },
      { status: 403 },
    );
  }
  return json({ ok: true });
});
