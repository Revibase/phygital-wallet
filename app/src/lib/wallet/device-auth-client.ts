/**
 * Platform-passkey device identity — register / login / links.
 * App session is credential-scoped. Browse unlock is an httpOnly cookie
 * from NFC tap / accessory Hold; claim/link uses platform WebAuthn only.
 */
import {
  startAuthentication as startPlatformAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

import { queryFetch, readJson } from "@/lib/queries/http";
import { authenticateToken } from "@/lib/token/authenticate";
import { clearClaimDismiss } from "@/lib/wallet/claim-setup-href";
import { assertPolicyMutation } from "@/lib/wallet/policies-client";

export type DeviceSessionInfo = {
  credentialId: string;
  expiresAt: number;
};

export type LinkStatus = "unlinked" | "linked_here" | "linked_elsewhere";

export type DeviceLink = {
  phygitalToken: string;
  label: string | null;
  imageUrl: string | null;
  mint: string | null;
  linkedAt: number;
};

export type TokenGate = {
  session: DeviceSessionInfo | null;
  browseUnlocked: boolean;
  linkStatus: LinkStatus | null;
  claimed: boolean;
};

/**
 * Session + browse unlock + link status + claimed in one request.
 * Prefer this on the token address gate over parallel auth GETs.
 */
export async function fetchTokenGate(phygitalToken: string): Promise<TokenGate> {
  const res = await queryFetch(
    `/auth/device/gate?phygitalToken=${encodeURIComponent(phygitalToken)}`,
  );
  const body = await readJson<{
    session: DeviceSessionInfo | null;
    browseUnlocked: boolean;
    linkStatus: LinkStatus | null;
    claimed: boolean;
  }>(res, "Couldn’t check token access");
  return {
    session: body.session,
    browseUnlocked: Boolean(body.browseUnlocked),
    linkStatus: body.linkStatus,
    claimed: Boolean(body.claimed),
  };
}

/** After Hold crypto, mint browse-unlock cookie without a second prompt. */
export async function unlockBrowseFromAccessory(args: {
  message: string;
  response: Awaited<ReturnType<typeof authenticateToken>>["response"];
  phygitalToken?: string;
}): Promise<{ phygitalToken: string; expiresAt: number }> {
  const res = await queryFetch("/auth/browse-unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: args.message,
      response: args.response,
      ...(args.phygitalToken ? { phygitalToken: args.phygitalToken } : {}),
    }),
  });
  const body = await readJson<{
    phygitalToken: string;
    expiresAt: number;
  }>(res, "Couldn’t unlock browse");
  clearClaimDismiss(body.phygitalToken);
  return body;
}

export async function fetchDeviceSession(): Promise<DeviceSessionInfo | null> {
  const res = await queryFetch("/auth/device-session");
  if (res.status === 401) return null;
  return readJson<DeviceSessionInfo>(res, "Couldn’t check sign-in");
}

export async function registerDevice(): Promise<DeviceSessionInfo> {
  const optionsRes = await queryFetch("/auth/device/register-options");
  const options = await readJson<
    PublicKeyCredentialCreationOptionsJSON & { userHandle: string }
  >(optionsRes, "Couldn’t start registration");
  const { userHandle, ...creation } = options;

  let credential: RegistrationResponseJSON;
  try {
    credential = await startRegistration({ optionsJSON: creation });
  } catch (e) {
    if (e instanceof Error && e.name === "NotAllowedError") {
      throw new Error("Registration was cancelled");
    }
    throw e;
  }

  const res = await queryFetch("/auth/device", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userHandle, credential }),
  });
  const body = await readJson<{ expiresAt: number; credentialId: string }>(
    res,
    "Couldn’t register this phone",
  );
  return { credentialId: body.credentialId, expiresAt: body.expiresAt };
}

async function assertPlatformPasskey(cancelMessage: string): Promise<{
  challengeId: string;
  credential: AuthenticationResponseJSON;
}> {
  const optionsRes = await queryFetch("/auth/device-session/options");
  const options = await readJson<
    PublicKeyCredentialRequestOptionsJSON & { challengeId: string }
  >(optionsRes, "Couldn’t start sign-in");
  const { challengeId, ...request } = options;
  try {
    const credential = await startPlatformAuthentication({
      optionsJSON: request,
    });
    return { challengeId, credential };
  } catch (e) {
    if (e instanceof Error && e.name === "NotAllowedError") {
      throw new Error(cancelMessage);
    }
    throw e;
  }
}

export async function loginDevice(): Promise<DeviceSessionInfo> {
  const { challengeId, credential } =
    await assertPlatformPasskey("Sign-in was cancelled");
  const res = await queryFetch("/auth/device-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, credential }),
  });
  const body = await readJson<{ expiresAt: number; credentialId: string }>(
    res,
    "Couldn’t sign in",
  );
  return { credentialId: body.credentialId, expiresAt: body.expiresAt };
}

export async function fetchDeviceLinks(): Promise<DeviceLink[]> {
  const res = await queryFetch("/auth/device/links");
  const body = await readJson<{ links: DeviceLink[] }>(
    res,
    "Couldn’t load linked accessories",
  );
  return body.links;
}

export async function linkToken(args: {
  phygitalToken: string;
  label?: string | null;
  imageUrl?: string | null;
  mint?: string | null;
}): Promise<LinkStatus> {
  const optionsRes = await queryFetch(
    `/auth/device/links/${encodeURIComponent(args.phygitalToken)}/mutation-options`,
    { method: "POST" },
  );
  const { challengeId, options } = await readJson<{
    challengeId: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }>(optionsRes, "Couldn’t start link confirmation");

  let assertion: AuthenticationResponseJSON;
  try {
    assertion = await startPlatformAuthentication({ optionsJSON: options });
  } catch (e) {
    if (e instanceof Error && e.name === "NotAllowedError") {
      throw new Error("Link was cancelled");
    }
    throw e;
  }

  const res = await queryFetch("/auth/device/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phygitalToken: args.phygitalToken,
      label: args.label,
      imageUrl: args.imageUrl,
      mint: args.mint,
      challengeId,
      assertion,
    }),
  });
  const body = await readJson<{ status: LinkStatus }>(
    res,
    "Couldn’t link this accessory",
  );
  return body.status;
}

export async function unlinkToken(phygitalToken: string): Promise<void> {
  const { challengeId, assertion } = await assertPolicyMutation(
    phygitalToken,
    { kind: "removeOwner" },
    "Unlink was cancelled",
  );

  const res = await queryFetch(
    `/auth/device/links/${encodeURIComponent(phygitalToken)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, assertion }),
    },
  );
  await readJson(res, "Couldn’t unlink");
}
