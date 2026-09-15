/**
 * Last-known-good encrypted wallet on the signer origin. Ciphertext only.
 * Parent XSS cannot read this store. Clearing site data for the signer origin
 * drops the cache; restore then depends on the parent/KV backup.
 */

import { MAX_BLOB_BYTES } from "./constants.js";
import { parseBlob } from "./wallet-service.js";
import type { ParsedWalletBlob } from "./wallet-format.js";

export const LOCAL_BLOB_KEY = "ssw1.wallet.blob";

export interface ByteStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function bytesToBinary(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

function binaryToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function defaultStore(): ByteStore | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    return ls;
  } catch {
    return null;
  }
}

export function readLocalBlob(store: ByteStore | null = defaultStore()): {
  raw: Uint8Array;
  parsed: ParsedWalletBlob;
} | null {
  if (!store) return null;
  let rawStr: string | null;
  try {
    rawStr = store.getItem(LOCAL_BLOB_KEY);
  } catch {
    return null;
  }
  if (!rawStr) return null;
  try {
    const raw = binaryToBytes(rawStr);
    if (raw.length > MAX_BLOB_BYTES) return null;
    const parsed = parseBlob(raw);
    return { raw, parsed };
  } catch {
    return null;
  }
}

export function writeLocalBlob(
  raw: Uint8Array,
  store: ByteStore | null = defaultStore(),
): boolean {
  if (!store) return false;
  try {
    parseBlob(raw);
    store.setItem(LOCAL_BLOB_KEY, bytesToBinary(raw));
    return true;
  } catch {
    return false;
  }
}
