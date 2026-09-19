/**
 * Signer → API owner-wallet backup. Ciphertext never crosses to the parent.
 * Challenges are minted here (signer origin), not via the app.
 */

import { MAX_BLOB_BYTES } from "./constants.js";

export const API_BASE_URL: string = (() => {
  const fromEnv = (
    import.meta.env?.VITE_API_BASE_URL as string | undefined
  )?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host =
    typeof globalThis !== "undefined" && "location" in globalThis
      ? (globalThis as { location?: { hostname: string } }).location?.hostname
      : undefined;
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:8787";
  }
  return "https://api.revibase.com";
})();

type Challenge = { challengeId: string; challenge: string };

async function errorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { code?: string };
    if (typeof body.code === "string" && body.code) return body.code;
  } catch {
    /* ignore */
  }
  return "BLOB_UNAVAILABLE";
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : { body: "{}" }),
  });
  if (!res.ok) throw new Error(await errorCode(res));
  return (await res.json()) as T;
}

export async function issueBackupChallenge(): Promise<Challenge> {
  const body = await postJson<{ challengeId?: string; challenge?: string }>(
    "/owner-wallet/blob/backup-challenge",
  );
  if (
    typeof body.challengeId !== "string" ||
    !body.challengeId ||
    typeof body.challenge !== "string" ||
    !body.challenge
  ) {
    throw new Error("BLOB_UNAVAILABLE");
  }
  return { challengeId: body.challengeId, challenge: body.challenge };
}

export async function issueRestoreChallenge(): Promise<Challenge> {
  const body = await postJson<{ challengeId?: string; challenge?: string }>(
    "/owner-wallet/blob/restore-challenge",
  );
  if (
    typeof body.challengeId !== "string" ||
    !body.challengeId ||
    typeof body.challenge !== "string" ||
    !body.challenge
  ) {
    throw new Error("BLOB_UNAVAILABLE");
  }
  return { challengeId: body.challengeId, challenge: body.challenge };
}

export async function restoreOwnerWalletBlob(params: {
  challengeId: string;
  assertion: Record<string, unknown>;
}): Promise<{
  encryptedWalletBlob: string;
  publicKey: string;
} | null> {
  const res = await fetch(`${API_BASE_URL}/owner-wallet/blob/restore`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      challengeId: params.challengeId,
      assertion: params.assertion,
    }),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errorCode(res));
  const body = (await res.json()) as {
    encryptedWalletBlob?: string;
    publicKey?: string;
  };
  if (
    typeof body.encryptedWalletBlob !== "string" ||
    !body.encryptedWalletBlob ||
    body.encryptedWalletBlob.length > MAX_BLOB_BYTES * 2
  ) {
    throw new Error("BLOB_UNAVAILABLE");
  }
  return {
    encryptedWalletBlob: body.encryptedWalletBlob,
    publicKey: String(body.publicKey ?? ""),
  };
}

export async function backupOwnerWalletBlob(params: {
  encryptedWalletBlob: string;
  publicKey: string;
  challengeId: string;
  signature: string;
  webauthnAttestationObject?: string;
}): Promise<{ expiresAt: number }> {
  const res = await fetch(`${API_BASE_URL}/owner-wallet/blob`, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      encryptedWalletBlob: params.encryptedWalletBlob,
      publicKey: params.publicKey,
      challengeId: params.challengeId,
      signature: params.signature,
      ...(params.webauthnAttestationObject
        ? { webauthnAttestationObject: params.webauthnAttestationObject }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(await errorCode(res));
  const body = (await res.json()) as { expiresAt?: number };
  return { expiresAt: Number(body.expiresAt) || 0 };
}
