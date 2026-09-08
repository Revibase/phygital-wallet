import { getD1 } from "@/shared/db";

export type DeviceCredential = {
  credentialId: string;
  publicKey: string;
  counter: number;
  userHandle: string;
  createdAt: number;
};

export type DeviceTokenLink = {
  credentialId: string;
  phygitalToken: string;
  label: string | null;
  imageUrl: string | null;
  mint: string | null;
  linkedAt: number;
};

function db() {
  return getD1();
}

export async function getCredentialById(
  credentialId: string,
): Promise<DeviceCredential | null> {
  const row = await db()
    .prepare(
      `SELECT credential_id, public_key, counter, user_handle, created_at
       FROM device_credentials WHERE credential_id = ?`,
    )
    .bind(credentialId)
    .first<{
      credential_id: string;
      public_key: string;
      counter: number;
      user_handle: string;
      created_at: number;
    }>();
  if (!row) return null;
  return {
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: row.counter,
    userHandle: row.user_handle,
    createdAt: row.created_at,
  };
}

export async function insertCredential(args: {
  credentialId: string;
  publicKey: string;
  userHandle: string;
}): Promise<DeviceCredential> {
  const now = Date.now();
  await db()
    .prepare(
      `INSERT INTO device_credentials
         (credential_id, public_key, counter, user_handle, created_at)
       VALUES (?, ?, 0, ?, ?)`,
    )
    .bind(args.credentialId, args.publicKey, args.userHandle, now)
    .run();
  return {
    credentialId: args.credentialId,
    publicKey: args.publicKey,
    counter: 0,
    userHandle: args.userHandle,
    createdAt: now,
  };
}

export async function updateCredentialCounter(
  credentialId: string,
  counter: number,
): Promise<void> {
  await db()
    .prepare(`UPDATE device_credentials SET counter = ? WHERE credential_id = ?`)
    .bind(counter, credentialId)
    .run();
}

export async function listLinksForCredential(
  credentialId: string,
): Promise<DeviceTokenLink[]> {
  const { results } = await db()
    .prepare(
      `SELECT credential_id, phygital_token, label, image_url, mint, linked_at
       FROM device_token_links
       WHERE credential_id = ?
       ORDER BY linked_at DESC`,
    )
    .bind(credentialId)
    .all<{
      credential_id: string;
      phygital_token: string;
      label: string | null;
      image_url: string | null;
      mint: string | null;
      linked_at: number;
    }>();
  return (results ?? []).map((row) => ({
    credentialId: row.credential_id,
    phygitalToken: row.phygital_token,
    label: row.label,
    imageUrl: row.image_url,
    mint: row.mint,
    linkedAt: row.linked_at,
  }));
}

export async function insertLink(args: {
  credentialId: string;
  phygitalToken: string;
  label?: string | null;
  imageUrl?: string | null;
  mint?: string | null;
}): Promise<DeviceTokenLink> {
  const now = Date.now();
  await db()
    .prepare(
      `INSERT INTO device_token_links
         (credential_id, phygital_token, label, image_url, mint, linked_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      args.credentialId,
      args.phygitalToken,
      args.label ?? null,
      args.imageUrl ?? null,
      args.mint ?? null,
      now,
    )
    .run();
  return {
    credentialId: args.credentialId,
    phygitalToken: args.phygitalToken,
    label: args.label ?? null,
    imageUrl: args.imageUrl ?? null,
    mint: args.mint ?? null,
    linkedAt: now,
  };
}

export async function deleteLink(
  credentialId: string,
  phygitalToken: string,
): Promise<boolean> {
  const result = await db()
    .prepare(
      `DELETE FROM device_token_links
       WHERE credential_id = ? AND phygital_token = ?`,
    )
    .bind(credentialId, phygitalToken)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
