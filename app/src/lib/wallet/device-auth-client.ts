/**
 * Platform-passkey device identity — register / login / links.
 * App session is credential-scoped; accessory Hold is for spend + link only.
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
import { startAuthentication } from "phygital-token-sdk";

import { queryFetch, readJson } from "@/lib/queries/http";
import { authenticateToken } from "@/lib/token/authenticate";

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

export type AccessoryAuth = {
  message: string;
  response: Awaited<ReturnType<typeof startAuthentication>>;
};

/** Match server possession TTL — browse/link reuse without a second Hold. */
const ACCESSORY_PROOF_TTL_MS = 5 * 60 * 1000;

function possessionStorageKey(phygitalToken: string): string {
  return `revibase.possession.${phygitalToken}`;
}

function accessoryProofStorageKey(phygitalToken: string): string {
  return `revibase.accessoryProof.${phygitalToken}`;
}

export function peekPossessionToken(phygitalToken: string): string | null {
  try {
    return sessionStorage.getItem(possessionStorageKey(phygitalToken));
  } catch {
    return null;
  }
}

export function storePossessionToken(
  phygitalToken: string,
  token: string,
): void {
  try {
    sessionStorage.setItem(possessionStorageKey(phygitalToken), token);
  } catch {
    /* private mode / quota */
  }
  try {
    // New possession = new unlock session → resurface claim prompt.
    sessionStorage.removeItem(`revibase.claimDismissed.${phygitalToken}`);
  } catch {
    /* ignore */
  }
}

export function clearPossessionToken(phygitalToken: string): void {
  try {
    sessionStorage.removeItem(possessionStorageKey(phygitalToken));
  } catch {
    /* ignore */
  }
}

type StoredAccessoryProof = AccessoryAuth & { storedAt: number };

/** Fresh cold-Hold / address-Hold proof for browse + link (not the HMAC tap token). */
export function peekAccessoryProof(
  phygitalToken: string,
): AccessoryAuth | null {
  try {
    const raw = sessionStorage.getItem(accessoryProofStorageKey(phygitalToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAccessoryProof>;
    if (
      typeof parsed.message !== "string" ||
      parsed.response == null ||
      typeof parsed.storedAt !== "number"
    ) {
      clearAccessoryProof(phygitalToken);
      return null;
    }
    if (Date.now() - parsed.storedAt > ACCESSORY_PROOF_TTL_MS) {
      clearAccessoryProof(phygitalToken);
      return null;
    }
    return { message: parsed.message, response: parsed.response as AccessoryAuth["response"] };
  } catch {
    return null;
  }
}

export function storeAccessoryProof(
  phygitalToken: string,
  accessory: AccessoryAuth,
): void {
  try {
    const payload: StoredAccessoryProof = {
      ...accessory,
      storedAt: Date.now(),
    };
    sessionStorage.setItem(
      accessoryProofStorageKey(phygitalToken),
      JSON.stringify(payload),
    );
  } catch {
    /* private mode / quota */
  }
  try {
    sessionStorage.removeItem(`revibase.claimDismissed.${phygitalToken}`);
  } catch {
    /* ignore */
  }
}

export function clearAccessoryProof(phygitalToken: string): void {
  try {
    sessionStorage.removeItem(accessoryProofStorageKey(phygitalToken));
  } catch {
    /* ignore */
  }
}

/** True when NFC possession token or a fresh cold-Hold proof is available. */
export function hasFreshPossession(phygitalToken: string): boolean {
  return (
    Boolean(peekPossessionToken(phygitalToken)) ||
    Boolean(peekAccessoryProof(phygitalToken))
  );
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

export async function fetchLinkStatus(
  phygitalToken: string,
): Promise<LinkStatus> {
  const res = await queryFetch(
    `/auth/device/links/status?phygitalToken=${encodeURIComponent(phygitalToken)}`,
  );
  const body = await readJson<{ status: LinkStatus }>(
    res,
    "Couldn’t check link status",
  );
  return body.status;
}

/** Public: whether any phone has claimed this token (no session). */
export async function fetchTokenClaimed(
  phygitalToken: string,
): Promise<boolean> {
  const res = await queryFetch(
    `/auth/device/links/claimed?phygitalToken=${encodeURIComponent(phygitalToken)}`,
  );
  const body = await readJson<{ claimed: boolean }>(
    res,
    "Couldn’t check claim status",
  );
  return Boolean(body.claimed);
}

/** Accessory Hold for link (reuses authenticateToken crypto). */
export async function holdAccessoryAuth(): Promise<
  AccessoryAuth & { secp256r1PublicKey: string }
> {
  return authenticateToken();
}

export async function linkToken(args: {
  phygitalToken: string;
  possessionToken?: string;
  accessory?: AccessoryAuth;
  label?: string | null;
  imageUrl?: string | null;
  mint?: string | null;
}): Promise<LinkStatus> {
  const res = await queryFetch("/auth/device/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await readJson<{ status: LinkStatus }>(
    res,
    "Couldn’t link this accessory",
  );
  return body.status;
}

export async function unlinkToken(phygitalToken: string): Promise<void> {
  const res = await queryFetch(
    `/auth/device/links/${encodeURIComponent(phygitalToken)}`,
    { method: "DELETE" },
  );
  await readJson(res, "Couldn’t unlink");
}

/** Clear platform session cookie (no Face ID). */
export async function logoutDevice(): Promise<void> {
  const res = await queryFetch("/auth/device-session", { method: "DELETE" });
  await readJson(res, "Couldn’t sign out");
}
