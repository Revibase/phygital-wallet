/**
 * postMessage protocol: strict, fail-closed schema validation.
 *
 * Pure module (no crypto, no DOM, no mutable state) so it is exhaustively unit-
 * testable and fuzzable (§37, §38). Everything crossing from the parent is
 * attacker-controlled (§44); this layer proves a message is structurally one of
 * our operations and nothing more. Semantic/crypto checks happen downstream.
 */

import {
  MAX_BLOB_BYTES,
  MAX_CREDENTIAL_ID_BYTES,
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
  | "INTERNAL_ERROR"
  | "BLOB_UNAVAILABLE";

export const REQUEST_TYPES = [
  "GET_PUBLIC_KEY",
  "IMPORT_KEY",
  "SIGN_TRANSACTION",
  "EXPORT_ENCRYPTED_WALLET",
  "EXPORT_PRIVATE_KEY",
  "AUTH_START",
  "BLOB_PROVIDED",
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

/** Maps a request type to its success-response type (BLOB_PROVIDED is a reply). */
export const RESULT_TYPE: Record<Exclude<RequestType, "BLOB_PROVIDED">, string> =
  {
    GET_PUBLIC_KEY: "GET_PUBLIC_KEY_RESULT",
    IMPORT_KEY: "IMPORT_KEY_RESULT",
    SIGN_TRANSACTION: "SIGN_TRANSACTION_RESULT",
    EXPORT_ENCRYPTED_WALLET: "EXPORT_ENCRYPTED_WALLET_RESULT",
    EXPORT_PRIVATE_KEY: "EXPORT_PRIVATE_KEY_RESULT",
    AUTH_START: "AUTH_COMPLETE",
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
    | { type: "IMPORT_KEY"; encryptedWalletBlob: string }
    | { type: "SIGN_TRANSACTION"; encryptedWalletBlob: string; transaction: string }
    | { type: "EXPORT_ENCRYPTED_WALLET"; encryptedWalletBlob: string }
    | { type: "EXPORT_PRIVATE_KEY"; encryptedWalletBlob: string }
    | { type: "AUTH_START"; encryptedWalletBlob?: string; putChallenge?: string; authMode?: "create" | "unlock"; credentialId?: string }
    | { type: "BLOB_PROVIDED"; encryptedWalletBlob?: string; errorCode?: ErrorCode }
  );

export type ValidationResult =
  | { ok: true; request: InboundRequest }
  | { ok: false; code: ErrorCode; requestId?: string };

// Allowed top-level keys per type. Any extra key => INVALID_MESSAGE (§9 strict).
const ALLOWED_KEYS: Record<RequestType, ReadonlySet<string>> = {
  GET_PUBLIC_KEY: new Set([
    "type",
    "protocolVersion",
    "requestId",
    "timestamp",
    "encryptedWalletBlob",
  ]),
  IMPORT_KEY: new Set([
    "type",
    "protocolVersion",
    "requestId",
    "timestamp",
    "encryptedWalletBlob",
  ]),
  SIGN_TRANSACTION: new Set([
    "type",
    "protocolVersion",
    "requestId",
    "timestamp",
    "encryptedWalletBlob",
    "transaction",
  ]),
  EXPORT_ENCRYPTED_WALLET: new Set([
    "type",
    "protocolVersion",
    "requestId",
    "timestamp",
    "encryptedWalletBlob",
  ]),
  EXPORT_PRIVATE_KEY: new Set([
    "type",
    "protocolVersion",
    "requestId",
    "timestamp",
    "encryptedWalletBlob",
  ]),
  AUTH_START: new Set([
    "type",
    "protocolVersion",
    "requestId",
    "timestamp",
    "encryptedWalletBlob",
    "putChallenge",
    "authMode",
    "credentialId",
  ]),
  BLOB_PROVIDED: new Set([
    "type",
    "protocolVersion",
    "requestId",
    "timestamp",
    "encryptedWalletBlob",
    "errorCode",
  ]),
};

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const ERROR_CODES = new Set<string>([
  "INVALID_MESSAGE",
  "UNSUPPORTED_PROTOCOL",
  "UNSUPPORTED_VERSION",
  "MALFORMED_TRANSACTION",
  "INVALID_WALLET_BLOB",
  "UNSUPPORTED_CREDENTIAL",
  "POLICY_REJECTED",
  "USER_CANCELLED",
  "AUTHENTICATION_FAILED",
  "DECRYPTION_FAILED",
  "WALLET_MISMATCH",
  "REPLAY_REJECTED",
  "INTERNAL_ERROR",
  "BLOB_UNAVAILABLE",
]);
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
  const rid =
    typeof requestId === "string" && REQUEST_ID_RE.test(requestId)
      ? requestId
      : undefined;

  if (data["protocolVersion"] !== PROTOCOL_VERSION) {
    return {
      ok: false,
      code: "UNSUPPORTED_PROTOCOL",
      ...(rid ? { requestId: rid } : {}),
    };
  }
  const type = data["type"];
  if (typeof type !== "string" || !REQUEST_TYPES.includes(type as RequestType)) {
    return {
      ok: false,
      code: "INVALID_MESSAGE",
      ...(rid ? { requestId: rid } : {}),
    };
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

  switch (rtype) {
    case "AUTH_START": {
      if (blob !== undefined && !validString(blob, b64Cap(MAX_BLOB_BYTES))) {
        return { ok: false, code: "INVALID_WALLET_BLOB", requestId: rid };
      }
      const putChallenge = data["putChallenge"];
      if (
        putChallenge !== undefined &&
        !validString(putChallenge, 128)
      ) {
        return { ok: false, code: "INVALID_MESSAGE", requestId: rid };
      }
      const authMode = data["authMode"];
      if (
        authMode !== undefined &&
        authMode !== "create" &&
        authMode !== "unlock"
      ) {
        return { ok: false, code: "INVALID_MESSAGE", requestId: rid };
      }
      const credentialId = data["credentialId"];
      if (
        credentialId !== undefined &&
        !validString(credentialId, b64Cap(MAX_CREDENTIAL_ID_BYTES))
      ) {
        return { ok: false, code: "INVALID_MESSAGE", requestId: rid };
      }
      return {
        ok: true,
        request: {
          ...common,
          type: "AUTH_START",
          ...(typeof blob === "string" ? { encryptedWalletBlob: blob } : {}),
          ...(typeof putChallenge === "string" ? { putChallenge } : {}),
          ...(authMode === "create" || authMode === "unlock"
            ? { authMode }
            : {}),
          ...(typeof credentialId === "string" ? { credentialId } : {}),
        },
      };
    }
    case "BLOB_PROVIDED": {
      const errorCode = data["errorCode"];
      if (
        errorCode !== undefined &&
        (typeof errorCode !== "string" || !ERROR_CODES.has(errorCode))
      ) {
        return { ok: false, code: "INVALID_MESSAGE", requestId: rid };
      }
      if (blob !== undefined && !validString(blob, b64Cap(MAX_BLOB_BYTES))) {
        return { ok: false, code: "INVALID_WALLET_BLOB", requestId: rid };
      }
      // Exactly one of blob or errorCode should be present for a useful reply;
      // both missing is allowed (treated as BLOB_UNAVAILABLE by the handler).
      return {
        ok: true,
        request: {
          ...common,
          type: "BLOB_PROVIDED",
          ...(typeof blob === "string" ? { encryptedWalletBlob: blob } : {}),
          ...(typeof errorCode === "string"
            ? { errorCode: errorCode as ErrorCode }
            : {}),
        },
      };
    }
    case "GET_PUBLIC_KEY":
      if (!validString(blob, b64Cap(MAX_BLOB_BYTES))) {
        return { ok: false, code: "INVALID_WALLET_BLOB", requestId: rid };
      }
      return {
        ok: true,
        request: {
          ...common,
          type: "GET_PUBLIC_KEY",
          encryptedWalletBlob: blob as string,
        },
      };
    case "IMPORT_KEY":
      if (!validString(blob, b64Cap(MAX_BLOB_BYTES))) {
        return { ok: false, code: "INVALID_WALLET_BLOB", requestId: rid };
      }
      return {
        ok: true,
        request: {
          ...common,
          type: "IMPORT_KEY",
          encryptedWalletBlob: blob as string,
        },
      };
    case "EXPORT_ENCRYPTED_WALLET":
      if (!validString(blob, b64Cap(MAX_BLOB_BYTES))) {
        return { ok: false, code: "INVALID_WALLET_BLOB", requestId: rid };
      }
      return {
        ok: true,
        request: {
          ...common,
          type: "EXPORT_ENCRYPTED_WALLET",
          encryptedWalletBlob: blob as string,
        },
      };
    case "EXPORT_PRIVATE_KEY":
      if (!validString(blob, b64Cap(MAX_BLOB_BYTES))) {
        return { ok: false, code: "INVALID_WALLET_BLOB", requestId: rid };
      }
      return {
        ok: true,
        request: {
          ...common,
          type: "EXPORT_PRIVATE_KEY",
          encryptedWalletBlob: blob as string,
        },
      };
    case "SIGN_TRANSACTION": {
      if (!validString(blob, b64Cap(MAX_BLOB_BYTES))) {
        return { ok: false, code: "INVALID_WALLET_BLOB", requestId: rid };
      }
      const tx = data["transaction"];
      if (!validString(tx, b64Cap(MAX_TX_BYTES))) {
        return { ok: false, code: "MALFORMED_TRANSACTION", requestId: rid };
      }
      return {
        ok: true,
        request: {
          ...common,
          type: "SIGN_TRANSACTION",
          encryptedWalletBlob: blob as string,
          transaction: tx as string,
        },
      };
    }
  }
}

/** Build a generic structured error response (§31 — no detail leakage). */
export function errorResponse(requestId: string | undefined, code: ErrorCode) {
  return { type: "ERROR", requestId: requestId ?? null, code } as const;
}
