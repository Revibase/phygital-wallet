/**
 * App client for the D1-backed encrypted owner-wallet blob backup.
 * Ciphertext only — never private keys.
 *
 * GET is hash-only (optional privacy). PUT requires an ed25519 signature over a
 * server challenge, produced inside the secure-signer during auth.
 */

import { queryFetch, readJson } from "@/lib/queries/http";

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  const bin = atob(padded + "=".repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes as BufferSource),
  );
  let s = "";
  for (const b of digest) s += b.toString(16).padStart(2, "0");
  return s;
}

/** sha256(credentialId) hex — matches the API lookup key. */
export async function credentialIdHashFromBase64Url(
  credentialIdB64Url: string,
): Promise<string> {
  return sha256Hex(base64UrlToBytes(credentialIdB64Url));
}

/** Mint a single-use challenge for PUT. */
export async function issueOwnerWalletPutChallenge(): Promise<{
  challengeId: string;
  challenge: string;
}> {
  const res = await queryFetch("/owner-wallet/blob/challenge", {
    method: "POST",
  });
  return readJson(res, "Failed to issue backup challenge");
}

/** Hash-only GET — no proof required (ciphertext is public). */
export async function fetchOwnerWalletBlob(
  credentialIdB64Url: string,
): Promise<string | null> {
  const credentialIdHash =
    await credentialIdHashFromBase64Url(credentialIdB64Url);
  const res = await queryFetch(
    `/owner-wallet/blob?credentialIdHash=${encodeURIComponent(credentialIdHash)}`,
  );
  if (res.status === 404) return null;
  const body = await readJson<{ encryptedWalletBlob: string }>(
    res,
    "Failed to load wallet backup",
  );
  return body.encryptedWalletBlob;
}

/** PUT with ed25519 possession proof from the secure signer. */
export async function backupOwnerWalletBlob(params: {
  encryptedWalletBlob: string;
  publicKey: string;
  challengeId: string;
  signature: string;
}): Promise<void> {
  const res = await queryFetch("/owner-wallet/blob", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      encryptedWalletBlob: params.encryptedWalletBlob,
      publicKey: params.publicKey,
      challengeId: params.challengeId,
      signature: params.signature,
    }),
  });
  await readJson(res, "Failed to store wallet backup");
}
