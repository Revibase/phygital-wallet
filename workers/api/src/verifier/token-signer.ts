/**
 * Resolve the per-token TokenSigner Durable Object stub.
 * Class is hosted on revibase-verifier-signer; api binds via script_name.
 */
import type { Instruction } from "@solana/kit";
import type { PaymentsPolicyConfig } from "phygital-policy";

import type { MutationBinding } from "@/auth/mutation-binding";
import { createLogger } from "@/shared/log";

type EffectivePolicy = {
  phygitalToken: string;
  policy: PaymentsPolicyConfig | null;
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
  verifyWebAuthnConnectAndMintBearer(input: {
    blockhash: string;
    response: unknown;
    origin: string | null;
    ttlMs: number;
  }): Promise<
    | { ok: true; accessToken: string; expiresAt: number; verifier: string }
    | { ok: false; code: string; error: string; status: number }
  >;
  verifyDynamicConnectAndMintBearer(input: {
    pk: string;
    s: string;
    c: string | number;
    n: string;
    origin: string | null;
    ttlMs: number;
  }): Promise<
    | { ok: true; accessToken: string; expiresAt: number; verifier: string }
    | { ok: false; code: string; error: string; status: number }
  >;
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
    policy: PaymentsPolicyConfig;
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
  }): Promise<{ ok: true; credentialId: string } | MutationFail>;
  applyFeeEvents(
    events: { signature: string; kind: "credit" | "debit"; lamports: number }[]
  ): Promise<{ applied: number }>;
  previewAuthorize(input: { instructions: Instruction[] }): Promise<
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
  signTransactions(
    wires: string[],
    auth?: {
      challengeId?: string | null;
      assertion?: unknown;
      origin?: string | null;
    }
  ): Promise<
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
  recordSoftDeny(input: {
    intentHash: string;
    code: string;
    error: string;
    details?: Record<string, unknown>;
    visitorCredentialId?: string | null;
  }): Promise<{ recorded: boolean }>;
  listOpenApprovals(): Promise<{
    approvals: {
      intentHash: string;
      code: string;
      error: string;
      details: Record<string, unknown> | null;
    }[];
  }>;
  resolvePendingApproval(input: {
    intentHash: string;
    resolution: "granted" | "denied" | "cancelled";
  }): Promise<{ resolved: boolean }>;
};

export function tokenSigner(env: Env, phygitalToken: string): TokenSignerRpc {
  const token = phygitalToken.trim();
  if (!token) {
    throw new Error("phygitalToken required");
  }
  createLogger("api", env).debug("tokenSigner.stub", { phygitalToken: token });
  return env.TOKEN_SIGNER.getByName(token) as unknown as TokenSignerRpc;
}
