/**
 * App client for owner_session + per-item owner_browse cookies.
 */

import { queryFetch, readJson, QueryHttpError } from "@/lib/queries/http";

export type AccessorySessionMode = "owner" | "accessory";

export type AccessorySession = {
  mode: AccessorySessionMode | null;
  phygitalToken: string | null;
  expiresAt?: number;
};

/** Mint a single-use challenge for owner-session cookie. */
export async function issueOwnerSessionChallenge(): Promise<{
  challengeId: string;
  challenge: string;
}> {
  const res = await queryFetch("/owner-session/challenge", { method: "POST" });
  return readJson(res, "Failed to issue owner session challenge");
}

/** POST owner-session with ed25519 proof from the secure signer. */
export async function mintOwnerSession(params: {
  publicKey: string;
  challengeId: string;
  signature: string;
}): Promise<{ expiresAt: number }> {
  const res = await queryFetch("/owner-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      publicKey: params.publicKey,
      challengeId: params.challengeId,
      signature: params.signature,
    }),
  });
  return readJson(res, "Failed to unlock owner session");
}

/** Clear owner_session + owner_browse cookies. */
export async function clearOwnerSession(): Promise<void> {
  const res = await queryFetch("/owner-session", { method: "DELETE" });
  await readJson(res, "Failed to clear owner session");
}

/**
 * Quiet per-item admit. Requires live owner_session cookie.
 * Throws QueryHttpError with status 401 when session is missing/expired.
 */
export async function mintOwnerBrowse(phygitalToken: string): Promise<{
  expiresAt: number;
  mode: "owner";
  phygitalToken: string;
}> {
  const res = await queryFetch("/accessory/owner-browse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phygitalToken }),
  });
  return readJson(res, "Failed to open accessory");
}

export async function fetchAccessorySession(): Promise<AccessorySession> {
  const res = await queryFetch("/accessory/session");
  return readJson(res, "Failed to load session");
}

export function isOwnerSessionRequiredError(error: unknown): boolean {
  return (
    error instanceof QueryHttpError &&
    (error.status === 401 || error.code === "owner_session_required")
  );
}
