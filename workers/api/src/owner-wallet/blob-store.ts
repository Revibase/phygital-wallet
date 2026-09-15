/**
 * D1 persistence for encrypted owner-wallet blobs (secure-signer backups).
 */
import { getD1 } from "@/shared/db";

export type OwnerWalletBlobRow = {
  credentialIdHash: string;
  publicKey: string;
  encryptedBlob: string;
  blobVersion: number;
  updatedAt: number;
};

type DbRow = {
  credential_id_hash: string;
  public_key: string;
  encrypted_blob: string;
  blob_version: number;
  updated_at: number;
};

function mapRow(r: DbRow): OwnerWalletBlobRow {
  return {
    credentialIdHash: r.credential_id_hash,
    publicKey: r.public_key,
    encryptedBlob: r.encrypted_blob,
    blobVersion: r.blob_version,
    updatedAt: r.updated_at,
  };
}

export async function getOwnerWalletBlob(
  credentialIdHash: string,
): Promise<OwnerWalletBlobRow | null> {
  const row = await getD1()
    .prepare(
      `SELECT credential_id_hash, public_key, encrypted_blob, blob_version, updated_at
       FROM owner_wallet_blob WHERE credential_id_hash = ?`,
    )
    .bind(credentialIdHash)
    .first<DbRow>();
  return row ? mapRow(row) : null;
}

/**
 * Insert or refresh ciphertext for the same wallet bind.
 * Returns "conflict" when an existing row has a different public_key.
 */
export async function putOwnerWalletBlob(params: {
  credentialIdHash: string;
  publicKey: string;
  encryptedBlob: string;
  blobVersion: number;
}): Promise<"created" | "updated" | "conflict"> {
  const db = getD1();
  const existing = await getOwnerWalletBlob(params.credentialIdHash);
  const now = Date.now();

  if (existing) {
    if (existing.publicKey !== params.publicKey) return "conflict";
    if (existing.encryptedBlob === params.encryptedBlob) return "updated";
    await db
      .prepare(
        `UPDATE owner_wallet_blob
         SET encrypted_blob = ?, blob_version = ?, updated_at = ?
         WHERE credential_id_hash = ?`,
      )
      .bind(
        params.encryptedBlob,
        params.blobVersion,
        now,
        params.credentialIdHash,
      )
      .run();
    return "updated";
  }

  await db
    .prepare(
      `INSERT INTO owner_wallet_blob
         (credential_id_hash, public_key, encrypted_blob, blob_version, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      params.credentialIdHash,
      params.publicKey,
      params.encryptedBlob,
      params.blobVersion,
      now,
    )
    .run();
  return "created";
}
