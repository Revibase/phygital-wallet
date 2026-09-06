/**
 * Resolve the per-token TokenSigner Durable Object stub.
 * Class is hosted on revibase-verifier-signer; api binds via script_name.
 */
import type { Instruction } from "phygital-verifier-sdk";
import type { PolicyDocument } from "phygital-verifier-sdk";

import type { MutationBinding } from "@/auth/mutation-binding";
import { createLogger } from "@/shared/log";

type EffectivePolicy = {
  phygitalToken: string;
  policy: PolicyDocument | null;
  status: "none" | "ok" | "invalid";
};

type MutationFail = {
  ok: false;
  code: string;
  error: string;
  details?: Record<string, unknown>;
};

/** Minimal RPC surface used by revibase-api (matches TokenSigner methods). */
export type TokenSignerRpc = {
  getPolicy(): Promise<EffectivePolicy>;
  getFeeBalance(): Promise<{ balanceLamports: number }>;
  hasOwner(): Promise<boolean>;
  isOwner(credentialId: string): Promise<boolean>;
  getOwnerCredentialId(): Promise<string | null>;
  addOwner(input: {
    credentialId: string;
    publicKey: string;
    label?: string | null;
    imageUrl?: string | null;
    mint?: string | null;
    challengeId: string;
    assertion: unknown;
    origin: string;
  }): Promise<{ ok: true } | { ok: false; code: string; error: string }>;
  createMutationChallenge(input: {
    origin: string;
    binding: MutationBinding;
  }): Promise<
    | { ok: true; challengeId: string; options: Record<string, unknown> }
    | { ok: false; code: string; error: string }
  >;
  setPolicy(input: {
    policy: PolicyDocument;
    challengeId: string;
    assertion: unknown;
    origin: string;
  }): Promise<{ ok: true; policy: EffectivePolicy } | MutationFail>;
  clearPolicy(input: {
    challengeId: string;
    assertion: unknown;
    origin: string;
  }): Promise<{ ok: true; policy: EffectivePolicy } | MutationFail>;
  createGrant(input: {
    intentHash: string;
    ttlSeconds?: number;
    challengeId: string;
    assertion: unknown;
    origin: string;
  }): Promise<
    | { ok: true; grantId: string; expiresAt: number; intentHash: string }
    | MutationFail
  >;
  removeOwnerAndClear(input: {
    challengeId: string;
    assertion: unknown;
    origin: string;
  }): Promise<
    | { ok: true; credentialId: string }
    | MutationFail
  >;
  applyFeeEvents(
    events: { signature: string; kind: "credit" | "debit"; lamports: number }[],
  ): Promise<{ applied: number }>;
  previewAuthorize(input: {
    instructions: Instruction[];
  }): Promise<
    | { ok: true; intentHash: string }
    | {
        ok: false;
        code: string;
        error: string;
        soft: boolean;
        intentHash?: string;
        details?: Record<string, unknown>;
        httpStatus?: number;
      }
  >;
  signTransactions(wires: string[]): Promise<
    | { ok: true; signatures: string[] }
    | {
        ok: false;
        status: number;
        body: {
          error: string;
          code: string;
          soft: boolean;
          details?: Record<string, unknown>;
        };
      }
  >;
};

export function tokenSigner(env: Env, phygitalToken: string): TokenSignerRpc {
  const token = phygitalToken.trim();
  if (!token) {
    throw new Error("phygitalToken required");
  }
  createLogger("api", env).debug("tokenSigner.stub", { phygitalToken: token });
  return env.TOKEN_SIGNER.getByName(token) as unknown as TokenSignerRpc;
}
