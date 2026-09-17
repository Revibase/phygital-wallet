/**
 * D1 persistence for encrypted owner-wallet blobs (secure-signer backups).
 *
 * New creates require a COSE public key from registration attestation.
 * Legacy rows with null COSE are still readable for a temporary restore window
 * (unlink / recovery); PUT can refresh them without attestation.
 */
import { getD1 } from "@/shared/db";

export type OwnerWalletBlobRow = {
  credentialIdHash: string;
  publicKey: string;
  encryptedBlob: string;
  blobVersion: number;
  updatedAt: number;
  /** Null on pre-COSE backups — temporary restore/PUT still allowed. */
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
  const key = r.webauthn_public_key?.trim() || null;
  return {
    credentialIdHash: r.credential_id_hash,
    publicKey: r.public_key,
    encryptedBlob: r.encrypted_blob,
    blobVersion: r.blob_version,
    updatedAt: r.updated_at,
    webauthnPublicKey: key,
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
 * Insert or refresh ciphertext.
 * Create requires COSE. Legacy null-COSE rows may be refreshed without COSE.
 * Updates never clear an existing COSE key; attestation upgrades a husk.
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
    if (
      existing.encryptedBlob === params.encryptedBlob &&
      (!incomingKey || existing.webauthnPublicKey === incomingKey)
    ) {
      return "updated";
    }

    if (existing.webauthnPublicKey) {
      // Never overwrite / clear COSE; ciphertext last-write-wins.
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

    // Legacy husk: refresh ciphertext; upgrade COSE if attestation provided.
    await db
      .prepare(
        `UPDATE owner_wallet_blob
         SET encrypted_blob = ?, blob_version = ?, updated_at = ?,
             webauthn_public_key = COALESCE(?, webauthn_public_key)
         WHERE credential_id_hash = ?`,
      )
      .bind(
        params.encryptedBlob,
        params.blobVersion,
        now,
        incomingKey,
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
