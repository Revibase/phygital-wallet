/**
 * App client for the D1-backed encrypted owner-wallet blob backup.
 * Ciphertext only — never private keys.
 *
 * Restore requires a WebAuthn assertion over a server challenge (same ceremony
 * as PRF unlock in the secure-signer). Backup (PUT) requires an ed25519
 * signature over a server challenge from the secure-signer — and mints
 * owner_session on success.
 */

import { queryFetch, readJson } from "@/lib/queries/http";

/** WebAuthn AuthenticationResponseJSON (base64url fields). */
export type OwnerWalletAssertionJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  clientExtensionResults?: AuthenticationExtensionsClientOutputs;
  authenticatorAttachment?: string;
};

/** Mint a single-use challenge for PUT backup. */
export async function issueOwnerWalletBackupChallenge(): Promise<{
  challengeId: string;
  challenge: string;
}> {
  const res = await queryFetch("/owner-wallet/blob/backup-challenge", {
    method: "POST",
  });
  return readJson(res, "Failed to issue backup challenge");
}

/**
 * Mint a single-use WebAuthn challenge for discoverable restore.
 * Pass `challenge` into AUTH_START as fetchChallenge; use `challengeId` when
 * posting the assertion to restoreOwnerWalletBlob.
 */
export async function issueOwnerWalletRestoreChallenge(): Promise<{
  challengeId: string;
  challenge: string;
}> {
  const res = await queryFetch("/owner-wallet/blob/restore-challenge", {
    method: "POST",
  });
  return readJson(res, "Failed to issue restore challenge");
}

/**
 * Restore ciphertext after WebAuthn assertion (POST /owner-wallet/blob/restore).
 * Returns null on 404 (no backup for this passkey).
 */
export async function restoreOwnerWalletBlob(params: {
  challengeId: string;
  assertion: OwnerWalletAssertionJSON;
}): Promise<string | null> {
  const res = await queryFetch("/owner-wallet/blob/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challengeId: params.challengeId,
      assertion: params.assertion,
    }),
  });
  if (res.status === 404) return null;
  const body = await readJson<{ encryptedWalletBlob: string }>(
    res,
    "Failed to load wallet backup",
  );
  return body.encryptedWalletBlob;
}

/** PUT with ed25519 possession proof — also mints owner_session cookie. */
export async function backupOwnerWalletBlob(params: {
  encryptedWalletBlob: string;
  publicKey: string;
  challengeId: string;
  signature: string;
  /** Registration attestationObject (base64url) — preferred on first backup. */
  webauthnAttestationObject?: string;
}): Promise<{ expiresAt: number }> {
  const res = await queryFetch("/owner-wallet/blob", {
    method: "PUT",
    headers: { "content-type": "application/json" },
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
  return readJson(res, "Failed to store wallet backup");
}
