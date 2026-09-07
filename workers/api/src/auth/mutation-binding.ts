/**
 * Mutation binding shared by api HTTP layer (mirrored from api-signer).
 * Keep in sync with workers/api-signer/src/webauthn-mutation.ts MutationBinding.
 *
 * `addOwner` is minted only via device claim routes (not `parseMutationBinding`).
 */
import type { PolicyDocument } from "phygital-verifier-sdk";

export type MutationBinding =
  | { kind: "addOwner"; credentialId: string }
  | { kind: "setPolicy"; policy: PolicyDocument }
  | { kind: "clearPolicy" }
  | { kind: "createGrant"; intentHash: string }
  | { kind: "removeOwner" }
  | { kind: "cosignConfig"; messageHash: string };

/** Owner-settings bindings only — claim uses `addOwner` via device routes. */
export function parseMutationBinding(
  body: unknown,
): Exclude<MutationBinding, { kind: "addOwner" }> | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const kind = raw.kind;
  if (kind === "setPolicy") {
    if (!raw.policy || typeof raw.policy !== "object") return null;
    return { kind: "setPolicy", policy: raw.policy as PolicyDocument };
  }
  if (kind === "clearPolicy") return { kind: "clearPolicy" };
  if (kind === "createGrant") {
    const intentHash =
      typeof raw.intentHash === "string" ? raw.intentHash.trim() : "";
    if (!intentHash) return null;
    return { kind: "createGrant", intentHash };
  }
  if (kind === "removeOwner") return { kind: "removeOwner" };
  if (kind === "cosignConfig") {
    const messageHash =
      typeof raw.messageHash === "string" ? raw.messageHash.trim() : "";
    if (!messageHash) return null;
    return { kind: "cosignConfig", messageHash };
  }
  return null;
}
