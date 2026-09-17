/**
 * D1 persistence for encrypted owner-wallet blobs (secure-signer backups).
 *
 * `webauthn_public_key` is COSE key bytes as base64url — used to verify the
 * discoverable assertion before returning ciphertext on restore.
 */
import { getD1 } from "@/shared/db";

export type OwnerWalletBlobRow = {
  credentialIdHash: string;
  publicKey: string;
  encryptedBlob: string;
  blobVersion: number;
  updatedAt: number;
  webauthnPublicKey: string | null;
};

type DbRow = {
  credential_id_hash: string;
  public_key: string;
  encrypted_blob: string;
  blob_version: number;
  updated_at: number;
  webauthn_public_key: string | null;
};

function mapRow(r: DbRow): OwnerWalletBlobRow {
  return {
    credentialIdHash: r.credential_id_hash,
    publicKey: r.public_key,
    encryptedBlob: r.encrypted_blob,
    blobVersion: r.blob_version,
    updatedAt: r.updated_at,
    webauthnPublicKey: r.webauthn_public_key,
  };
}

const SELECT_COLS = `credential_id_hash, public_key, encrypted_blob, blob_version,
       updated_at, webauthn_public_key`;

export async function getOwnerWalletBlob(
  credentialIdHash: string,
): Promise<OwnerWalletBlobRow | null> {
  const row = await getD1()
    .prepare(
      `SELECT ${SELECT_COLS}
       FROM owner_wallet_blob WHERE credential_id_hash = ?`,
    )
    .bind(credentialIdHash)
    .first<DbRow>();
  return row ? mapRow(row) : null;
}

/**
 * Insert or refresh ciphertext for the same wallet bind.
 * Returns "conflict" when an existing row has a different public_key.
 * Returns "webauthn_required" when creating without a COSE public key.
 *
 * On update: set webauthn_public_key only if currently null and a key is
 * provided; never overwrite an existing key.
 */
export async function putOwnerWalletBlob(params: {
  credentialIdHash: string;
  publicKey: string;
  encryptedBlob: string;
  blobVersion: number;
  webauthnPublicKey?: string | null;
}): Promise<"created" | "updated" | "conflict" | "webauthn_required"> {
  const db = getD1();
  const existing = await getOwnerWalletBlob(params.credentialIdHash);
  const now = Date.now();
  const incomingKey = params.webauthnPublicKey?.trim() || null;

  if (existing) {
    if (existing.publicKey !== params.publicKey) return "conflict";
    const nextKey = existing.webauthnPublicKey ?? incomingKey;
    const keyNeedsSet = !existing.webauthnPublicKey && !!incomingKey;
    if (existing.encryptedBlob === params.encryptedBlob && !keyNeedsSet) {
      return "updated";
    }
    await db
      .prepare(
        `UPDATE owner_wallet_blob
         SET encrypted_blob = ?, blob_version = ?, updated_at = ?,
             webauthn_public_key = ?
         WHERE credential_id_hash = ?`,
      )
      .bind(
        params.encryptedBlob,
        params.blobVersion,
        now,
        nextKey,
        params.credentialIdHash,
      )
      .run();
    return "updated";
  }

  if (!incomingKey) return "webauthn_required";

  await db
    .prepare(
      `INSERT INTO owner_wallet_blob
         (credential_id_hash, public_key, encrypted_blob, blob_version,
          updated_at, webauthn_public_key)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      params.credentialIdHash,
      params.publicKey,
      params.encryptedBlob,
      params.blobVersion,
      now,
      incomingKey,
    )
    .run();
  return "created";
}
