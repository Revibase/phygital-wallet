/**
 * Local vs remote encrypted-blob authority. Decrypt remains the cryptographic
 * check; this only decides which structurally valid blob to attempt, and when
 * a conflict must be shown to the user instead of silent overwrite.
 */

import { bytesEqual } from "./encoding.js";
import type { ParsedWalletBlob } from "./wallet-format.js";

export function bindsEqual(a: ParsedWalletBlob, b: ParsedWalletBlob): boolean {
  return bytesEqual(a.publicKey, b.publicKey) && bytesEqual(a.credentialId, b.credentialId);
}

export type BlobPick =
  | { kind: "none" }
  | { kind: "use"; parsed: ParsedWalletBlob; source: "local" | "remote"; writeLocal: boolean }
  | { kind: "conflict"; local: ParsedWalletBlob; remote: ParsedWalletBlob };

/** Sign-in / import: never overwrite a valid local wallet with a different remote bind. */
export function pickForAuth(
  local: ParsedWalletBlob | null,
  remote: ParsedWalletBlob | null,
): BlobPick {
  if (!local && !remote) return { kind: "none" };
  if (!local && remote) {
    return { kind: "use", parsed: remote, source: "remote", writeLocal: true };
  }
  if (local && !remote) {
    return { kind: "use", parsed: local, source: "local", writeLocal: false };
  }
  if (local && remote) {
    if (bindsEqual(local, remote)) {
      return { kind: "use", parsed: local, source: "local", writeLocal: false };
    }
    return { kind: "conflict", local, remote };
  }
  return { kind: "none" };
}

/**
 * Signing / export: prefer the signer-origin cache so a parent XSS cannot swap
 * in a different wallet. Fall back to the parent blob only when local is absent.
 */
export function pickForSensitiveOp(
  local: ParsedWalletBlob | null,
  remote: ParsedWalletBlob | null,
): ParsedWalletBlob | null {
  if (local && remote && bindsEqual(local, remote)) return local;
  if (local) return local;
  return remote;
}
