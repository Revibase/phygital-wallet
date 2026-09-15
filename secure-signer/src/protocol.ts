/**
 * postMessage protocol: strict, fail-closed schema validation.
 *
 * Pure module (no crypto, no DOM, no mutable state) so it is exhaustively unit-
 * testable and fuzzable (§37, §38). Everything crossing from the parent is
 * attacker-controlled (§44); this layer proves a message is structurally one of
 * our six operations and nothing more. Semantic/crypto checks happen downstream.
 */

import {
  MAX_BLOB_BYTES,
  MAX_MESSAGE_BYTES,
  MAX_TX_BYTES,
  PROTOCOL_VERSION,
} from "./constants.js";

export type ErrorCode =
  | "INVALID_MESSAGE"
  | "UNSUPPORTED_PROTOCOL"
  | "UNSUPPORTED_VERSION"
  | "MALFORMED_TRANSACTION"
  | "INVALID_WALLET_BLOB"
  | "UNSUPPORTED_CREDENTIAL"
  | "POLICY_REJECTED"
  | "USER_CANCELLED"
  | "AUTHENTICATION_FAILED"
  | "DECRYPTION_FAILED"
  | "WALLET_MISMATCH"
  | "REPLAY_REJECTED"
  | "INTERNAL_ERROR";

export const REQUEST_TYPES = [
  "GET_PUBLIC_KEY",
  "CREATE_KEY",
  "IMPORT_KEY",
  "SIGN_TRANSACTION",
  "EXPORT_ENCRYPTED_WALLET",
  "EXPORT_PRIVATE_KEY",
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

/** Maps a request type to its success-response type. */
export const RESULT_TYPE: Record<RequestType, string> = {
  GET_PUBLIC_KEY: "GET_PUBLIC_KEY_RESULT",
  CREATE_KEY: "CREATE_KEY_RESULT",
  IMPORT_KEY: "IMPORT_KEY_RESULT",
  SIGN_TRANSACTION: "SIGN_TRANSACTION_RESULT",
  EXPORT_ENCRYPTED_WALLET: "EXPORT_ENCRYPTED_WALLET_RESULT",
  EXPORT_PRIVATE_KEY: "EXPORT_PRIVATE_KEY_RESULT",
};

interface Common {
  protocolVersion: number;
  requestId: string;
  /** Optional client timestamp (ms). Used for freshness (§9). */
  timestamp?: number;
}

export type InboundRequest = Common &
  (
    | { type: "GET_PUBLIC_KEY"; encryptedWalletBlob: string }
    | { type: "CREATE_KEY" }
    | { type: "IMPORT_KEY"; encryptedWalletBlob: string }
    | { type: "SIGN_TRANSACTION"; encryptedWalletBlob: string; transaction: string }
    | { type: "EXPORT_ENCRYPTED_WALLET"; encryptedWalletBlob: string }
    | { type: "EXPORT_PRIVATE_KEY"; encryptedWalletBlob: string }
  );

export type ValidationResult =
  | { ok: true; request: InboundRequest }
  | { ok: false; code: ErrorCode; requestId?: string };

// Allowed top-level keys per type. Any extra key => INVALID_MESSAGE (§9 strict).
const ALLOWED_KEYS: Record<RequestType, ReadonlySet<string>> = {
  GET_PUBLIC_KEY: new Set(["type", "protocolVersion", "requestId", "timestamp", "encryptedWalletBlob"]),
  CREATE_KEY: new Set(["type", "protocolVersion", "requestId", "timestamp"]),
  IMPORT_KEY: new Set(["type", "protocolVersion", "requestId", "timestamp", "encryptedWalletBlob"]),
  SIGN_TRANSACTION: new Set(["type", "protocolVersion", "requestId", "timestamp", "encryptedWalletBlob", "transaction"]),
  EXPORT_ENCRYPTED_WALLET: new Set(["type", "protocolVersion", "requestId", "timestamp", "encryptedWalletBlob"]),
  EXPORT_PRIVATE_KEY: new Set(["type", "protocolVersion", "requestId", "timestamp", "encryptedWalletBlob"]),
};

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
// base64 expands 3 bytes -> 4 chars; +4 slack for padding.
const b64Cap = (bytes: number) => Math.ceil((bytes * 4) / 3) + 4;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Approximate serialized size; rejects circular / unserializable payloads. */
export function messageByteLength(data: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(data)).length;
  } catch {
    return null;
  }
}

function validString(v: unknown, maxLen: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= maxLen;
}

/**
 * Validate raw `event.data`. Returns a typed request or a fail-closed code.
 * Does NOT check origin/source (dispatcher's job) or replay/freshness (state's).
 */
export function validateInbound(data: unknown): ValidationResult {
  const size = messageByteLength(data);
  if (size === null || size > MAX_MESSAGE_BYTES) {
    return { ok: false, code: "INVALID_MESSAGE" };
  }
  if (!isPlainObject(data)) return { ok: false, code: "INVALID_MESSAGE" };

  const requestId = data["requestId"];
  const rid = typeof requestId === "string" && REQUEST_ID_RE.test(requestId)
    ? requestId
    : undefined;

  if (data["protocolVersion"] !== PROTOCOL_VERSION) {
    return { ok: false, code: "UNSUPPORTED_PROTOCOL", ...(rid ? { requestId: rid } : {}) };
  }
  const type = data["type"];
  if (typeof type !== "string" || !REQUEST_TYPES.includes(type as RequestType)) {
    return { ok: false, code: "INVALID_MESSAGE", ...(rid ? { requestId: rid } : {}) };
  }
  if (!rid) return { ok: false, code: "INVALID_MESSAGE" };

  const rtype = type as RequestType;
  // Strict: reject any key not in this type's allowlist.
  for (const key of Object.keys(data)) {
    if (!ALLOWED_KEYS[rtype].has(key)) {
      return { ok: false, code: "INVALID_MESSAGE", requestId: rid };
    }
  }

  const ts = data["timestamp"];
  if (ts !== undefined && (typeof ts !== "number" || !Number.isFinite(ts))) {
    return { ok: false, code: "INVALID_MESSAGE", requestId: rid };
  }
  const common: Common = {
    protocolVersion: PROTOCOL_VERSION,
    requestId: rid,
    ...(typeof ts === "number" ? { timestamp: ts } : {}),
  };

  const blob = data["encryptedWalletBlob"];
  const needsBlob = rtype !== "CREATE_KEY";
  if (needsBlob && !validString(blob, b64Cap(MAX_BLOB_BYTES))) {
    return { ok: false, code: "INVALID_WALLET_BLOB", requestId: rid };
  }

  switch (rtype) {
    case "CREATE_KEY":
      return { ok: true, request: { ...common, type: "CREATE_KEY" } };
    case "GET_PUBLIC_KEY":
      return { ok: true, request: { ...common, type: "GET_PUBLIC_KEY", encryptedWalletBlob: blob as string } };
    case "IMPORT_KEY":
      return { ok: true, request: { ...common, type: "IMPORT_KEY", encryptedWalletBlob: blob as string } };
    case "EXPORT_ENCRYPTED_WALLET":
      return { ok: true, request: { ...common, type: "EXPORT_ENCRYPTED_WALLET", encryptedWalletBlob: blob as string } };
    case "EXPORT_PRIVATE_KEY":
      return { ok: true, request: { ...common, type: "EXPORT_PRIVATE_KEY", encryptedWalletBlob: blob as string } };
    case "SIGN_TRANSACTION": {
      const tx = data["transaction"];
      if (!validString(tx, b64Cap(MAX_TX_BYTES))) {
        return { ok: false, code: "MALFORMED_TRANSACTION", requestId: rid };
      }
      return { ok: true, request: { ...common, type: "SIGN_TRANSACTION", encryptedWalletBlob: blob as string, transaction: tx as string } };
    }
  }
}

/** Build a generic structured error response (§31 — no detail leakage). */
export function errorResponse(requestId: string | undefined, code: ErrorCode) {
  return { type: "ERROR", requestId: requestId ?? null, code } as const;
}
