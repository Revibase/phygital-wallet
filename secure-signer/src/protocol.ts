/**
 * postMessage protocol: strict, fail-closed schema validation.
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
  "SIGN_TRANSACTION",
  "EXPORT_PRIVATE_KEY",
  "AUTH_START",
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const RESULT_TYPE: Record<RequestType, string> = {
  SIGN_TRANSACTION: "SIGN_TRANSACTION_RESULT",
  EXPORT_PRIVATE_KEY: "EXPORT_PRIVATE_KEY_RESULT",
  AUTH_START: "AUTH_COMPLETE",
};

interface Common {
  protocolVersion: number;
  requestId: string;
  timestamp: number;
}

export type InboundRequest = Common &
  (
    | { type: "SIGN_TRANSACTION"; transaction: string }
    | { type: "EXPORT_PRIVATE_KEY" }
    | {
        type: "AUTH_START";
        authMode?: "create" | "unlock";
        credentialId?: string;
        webauthnAttestationObject?: string;
      }
  );

export type ValidationResult =
  | { ok: true; request: InboundRequest }
  | { ok: false; code: ErrorCode; requestId?: string };

const ALLOWED_KEYS: Record<RequestType, ReadonlySet<string>> = {
  SIGN_TRANSACTION: new Set([
    "type",
    "protocolVersion",
    "requestId",
    "timestamp",
    "transaction",
  ]),
  EXPORT_PRIVATE_KEY: new Set([
    "type",
    "protocolVersion",
    "requestId",
    "timestamp",
  ]),
  AUTH_START: new Set([
    "type",
    "protocolVersion",
    "requestId",
    "timestamp",
    "authMode",
    "credentialId",
    "webauthnAttestationObject",
  ]),
};

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const b64Cap = (bytes: number) => Math.ceil((bytes * 4) / 3) + 4;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

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
  if (
    typeof type !== "string" ||
    !REQUEST_TYPES.includes(type as RequestType)
  ) {
    return {
      ok: false,
      code: "INVALID_MESSAGE",
      ...(rid ? { requestId: rid } : {}),
    };
  }
  if (!rid) return { ok: false, code: "INVALID_MESSAGE" };

  const rtype = type as RequestType;
  for (const key of Object.keys(data)) {
    if (!ALLOWED_KEYS[rtype].has(key)) {
      return { ok: false, code: "INVALID_MESSAGE", requestId: rid };
    }
  }

  const ts = data["timestamp"];
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return { ok: false, code: "INVALID_MESSAGE", requestId: rid };
  }
  const common: Common = {
    protocolVersion: PROTOCOL_VERSION,
    requestId: rid,
    timestamp: ts,
  };

  switch (rtype) {
    case "AUTH_START": {
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
      const webauthnAttestationObject = data["webauthnAttestationObject"];
      if (
        webauthnAttestationObject !== undefined &&
        !validString(webauthnAttestationObject, b64Cap(MAX_BLOB_BYTES))
      ) {
        return { ok: false, code: "INVALID_MESSAGE", requestId: rid };
      }
      return {
        ok: true,
        request: {
          ...common,
          type: "AUTH_START",
          ...(authMode === "create" || authMode === "unlock"
            ? { authMode }
            : {}),
          ...(typeof credentialId === "string" ? { credentialId } : {}),
          ...(typeof webauthnAttestationObject === "string"
            ? { webauthnAttestationObject }
            : {}),
        },
      };
    }
    case "SIGN_TRANSACTION": {
      const tx = data["transaction"];
      if (!validString(tx, b64Cap(MAX_TX_BYTES))) {
        return { ok: false, code: "INVALID_MESSAGE", requestId: rid };
      }
      return {
        ok: true,
        request: { ...common, type: "SIGN_TRANSACTION", transaction: tx },
      };
    }
    case "EXPORT_PRIVATE_KEY":
      return { ok: true, request: { ...common, type: "EXPORT_PRIVATE_KEY" } };
  }
}

export function errorResponse(
  requestId: string | undefined,
  code: ErrorCode,
): Record<string, unknown> {
  return {
    type: "ERROR",
    protocolVersion: PROTOCOL_VERSION,
    ...(requestId ? { requestId } : {}),
    code,
  };
}
