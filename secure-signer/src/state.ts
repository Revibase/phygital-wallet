/**
 * Signer state machine + replay/freshness + digest-bound authorization (§15, §22).
 *
 * Invariants:
 *  - One sensitive flow active at a time (§33). A second request while one is
 *    pending is rejected without disturbing the active operation.
 *  - Duplicate request ids and stale requests are rejected (§9).
 *  - Authorization is single-use and BOUND to the exact message digest that was
 *    validated and displayed. Signing verifies the frozen bytes still hash to the
 *    authorized digest, so a transaction cannot be swapped after confirmation.
 */

import type { ErrorCode } from "./protocol.js";
import {
  REQUEST_FRESHNESS_WINDOW_MS,
  SEEN_REQUEST_IDS_LIMIT,
} from "./constants.js";

export type OperationState =
  | "IDLE"
  | "CREATE_PENDING"
  | "IMPORT_PENDING"
  | "SIGN_PENDING"
  | "PRIVATE_EXPORT_PENDING"
  | "AUTH_PENDING";

export interface Authorization {
  operation: OperationState;
  requestId: string;
  /** The wallet public key the operation is bound to. */
  walletPublicKey: Uint8Array;
  /** SHA-256 of the exact validated message bytes (hex). */
  messageDigest: string;
  createdAt: number;
}

export class SignerState {
  private state: OperationState = "IDLE";
  private activeRequestId: string | null = null;
  private authorization: Authorization | null = null;
  private readonly seen = new Set<string>();
  private readonly seenOrder: string[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  get current(): OperationState {
    return this.state;
  }

  isBusy(): boolean {
    return this.state !== "IDLE";
  }

  /**
   * Reject stale or duplicate requests. Returns an error code or null if fresh.
   * `BLOB_PROVIDED` may reuse the active AUTH_START request id (continuation).
   */
  checkFreshnessAndReplay(
    requestId: string,
    timestamp?: number,
    opts?: { continuation?: boolean },
  ): ErrorCode | null {
    if (this.seen.has(requestId)) {
      if (
        opts?.continuation &&
        this.state === "AUTH_PENDING" &&
        this.activeRequestId === requestId
      ) {
        return null;
      }
      return "REPLAY_REJECTED";
    }
    if (timestamp !== undefined) {
      const skew = Math.abs(this.now() - timestamp);
      if (skew > REQUEST_FRESHNESS_WINDOW_MS) return "REPLAY_REJECTED";
    }
    return null;
  }

  /** Record a request id as seen (bounded FIFO). Call once a request is accepted. */
  remember(requestId: string): void {
    if (this.seen.has(requestId)) return;
    this.seen.add(requestId);
    this.seenOrder.push(requestId);
    if (this.seenOrder.length > SEEN_REQUEST_IDS_LIMIT) {
      const evicted = this.seenOrder.shift()!;
      this.seen.delete(evicted);
    }
  }

  /** Begin an operation. Returns false if another sensitive flow is active. */
  begin(op: Exclude<OperationState, "IDLE">, requestId: string): boolean {
    if (this.state !== "IDLE") return false;
    this.state = op;
    this.activeRequestId = requestId;
    return true;
  }

  /** End the active operation and clear any authorization. */
  end(): void {
    this.state = "IDLE";
    this.activeRequestId = null;
    this.authorization = null;
  }

  activeRequest(): string | null {
    return this.activeRequestId;
  }

  /** Bind a fresh, single-use authorization to a digest + wallet. */
  authorize(auth: Authorization): void {
    this.authorization = auth;
  }

  /**
   * Consume the authorization iff it matches this operation, request, and the
   * digest of the bytes about to be signed. Single-use: clears on any call.
   */
  consumeAuthorization(params: {
    operation: OperationState;
    requestId: string;
    messageDigest: string;
  }): Authorization | null {
    const a = this.authorization;
    this.authorization = null; // single-use regardless of outcome
    if (!a) return null;
    if (a.operation !== params.operation) return null;
    if (a.requestId !== params.requestId) return null;
    if (a.messageDigest !== params.messageDigest) return null;
    return a;
  }
}

/** Hex SHA-256 of bytes — the digest we bind authorization to. */
export async function digestHex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource));
  let s = "";
  for (const b of d) s += b.toString(16).padStart(2, "0");
  return s;
}
