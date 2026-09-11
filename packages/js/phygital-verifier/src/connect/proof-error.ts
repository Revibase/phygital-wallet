/**
 * Connect-proof failures, shared by both proof types (WebAuthn and dynamic tap).
 *
 * Each code carries its own HTTP status so callers never maintain a second
 * code→status table: a new code must be added to {@link CONNECT_PROOF_STATUS},
 * and the union makes a missing entry a compile error.
 */

export type ConnectProofCode =
  | "invalid_proof"
  | "stale_blockhash"
  | "invalid_signature"
  | "passkey_invalid"
  | "assertion_replay"
  | "token_not_found"
  | "tap_replay";

const CONNECT_PROOF_STATUS: Record<ConnectProofCode, number> = {
  invalid_proof: 400,
  stale_blockhash: 400,
  invalid_signature: 400,
  passkey_invalid: 403,
  assertion_replay: 409,
  token_not_found: 404,
  tap_replay: 409,
};

export class ConnectProofError extends Error {
  readonly code: ConnectProofCode;
  /** HTTP status for this code — see {@link CONNECT_PROOF_STATUS}. */
  readonly status: number;

  constructor(code: ConnectProofCode, message: string) {
    super(message);
    this.name = "ConnectProofError";
    this.code = code;
    this.status = CONNECT_PROOF_STATUS[code];
  }
}
