/**
 * TokenSigner Durable Object — per-phygitalToken authorize, co-sign, policy,
 * grants, fees, and owner membership. Hosted on revibase-verifier-signer.
 */
import { DurableObject } from "cloudflare:workers";
import { Blockhash, type Address, type Instruction } from "@solana/kit";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { PaymentsPolicyConfig } from "phygital-policy";
import {
  ConnectProofError,
  signVerifierBearer,
  verifyConnectProof,
  verifyDynamicConnectProof,
} from "phygital-verifier-sdk";

import { createVerifierSignerBackend } from "@/backend/create";
import type { VerifierSignerBackend } from "@/backend/types";
import { getRandomVerifier } from "@/fees/default-verifier";
import { assertFeeBalance } from "@/fees/fee-balance-gate";
import { base64ToBytes } from "@/shared/crypto/base64";
import { createLogger, withLoggedRpc, type Logger } from "@/shared/log";
import { runWithRequestStore } from "@/shared/request-context";
import { authorizeIntent } from "@/verifier/approval";
import { assertPreviewWalletSigner } from "@/verifier/assert-preview-wallet";
import { mapCodedVerifierError } from "@/verifier/coded-error";
import {
  decodeWireTransaction,
  type DecodedSignTx,
} from "@/verifier/decode-tx";
import type {
  PreviewAuthorizeResult,
  SignTransactionsResult,
} from "@/verifier/signer-service";
import {
  initTokenSchema,
  TokenStore,
  type AccessoryCounterKind,
  type FeeEvent,
  type EffectivePolicy,
} from "@/token-store";
import {
  buildMutationOptions,
  verifyMutationAssertion,
  type MutationBinding,
} from "@/webauthn-mutation";
import { assertOnChainUnlinkTeardown } from "@/unlink-teardown";
import { getSolanaRpc } from "./shared/solana/cluster";

type AddOwnerInput = {
  credentialId: string;
  publicKey: string;
  label?: string | null;
  imageUrl?: string | null;
  mint?: string | null;
};

type AddOwnerResult = { ok: true } | { ok: false; code: string; error: string };

type MutationResult<T = unknown> =
  | ({ ok: true } & T)
  | {
      ok: false;
      code: string;
      error: string;
      details?: Record<string, unknown>;
    };

/** Resolve DO name / token from Durable Object id (name-based ids). */
function tokenFromName(name: string | null | undefined): string {
  if (!name?.trim()) {
    throw Object.assign(
      new Error("TokenSigner requires idFromName(phygitalToken)"),
      {
        code: "signer_misconfigured",
      },
    );
  }
  return name.trim();
}

export class TokenSigner extends DurableObject<Env> {
  #store: TokenStore | null = null;
  #backend: VerifierSignerBackend | null = null;
  #token: string | null = null;
  #logger: Logger | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      initTokenSchema(this.ctx.storage.sql);
    });
  }

  #log(): Logger {
    if (!this.#logger) {
      this.#logger = createLogger("token-signer", this.env, {
        durableObjectId: this.ctx.id.toString(),
      });
    }
    return this.#logger;
  }

  #rpc<T>(
    method: string,
    fields: Record<string, unknown>,
    fn: () => Promise<T>,
  ): Promise<T> {
    return withLoggedRpc(this.#log(), method, fields, fn);
  }

  #getToken(): string {
    if (!this.#token) {
      this.#token = tokenFromName(this.ctx.id.name);
    }
    return this.#token;
  }

  #bindToken(token: string): void {
    const trimmed = token.trim();
    if (this.#token && this.#token !== trimmed) {
      throw Object.assign(new Error("TokenSigner DO token mismatch"), {
        code: "token_mismatch",
      });
    }
    this.#token = trimmed;
    this.#getStore().ensureToken(trimmed);
  }

  #getStore(): TokenStore {
    if (!this.#store) {
      const token = this.#getToken();
      this.#store = new TokenStore(this.ctx.storage.sql, token);
      this.#store.ensureToken(token);
    }
    return this.#store;
  }

  #getBackend(): VerifierSignerBackend {
    if (!this.#backend) {
      this.#backend = createVerifierSignerBackend(this.env);
    }
    return this.#backend;
  }

  #withEnv<T>(fn: () => T | Promise<T>): Promise<T> {
    return Promise.resolve(
      runWithRequestStore(
        {
          env: this.env,
          tokenStore: this.#getStore(),
        },
        fn,
      ),
    );
  }

  // --- reads (no auth) ---

  async getPolicy(): Promise<EffectivePolicy> {
    return this.#rpc(
      "getPolicy",
      { phygitalToken: this.#getToken() },
      async () => this.#getStore().getEffectivePolicy(),
    );
  }

  async getFeeBalance(): Promise<{ balanceLamports: number }> {
    return this.#rpc(
      "getFeeBalance",
      { phygitalToken: this.#getToken() },
      async () => ({
        balanceLamports: this.#getStore().getFeeBalanceLamports(),
      }),
    );
  }

  async hasOwner(): Promise<boolean> {
    return this.#rpc(
      "hasOwner",
      { phygitalToken: this.#getToken() },
      async () => this.#getStore().hasOwner(),
    );
  }

  /** Verify a WebAuthn proof, consume it, and mint the bearer in this DO. */
  async verifyWebAuthnConnectAndMintBearer(input: {
    blockhash: string;
    response: AuthenticationResponseJSON;
    origin: string | null;
    ttlMs: number;
  }): Promise<
    | { ok: true; accessToken: string; expiresAt: number; verifier: string }
    | { ok: false; code: string; error: string; status: number }
  > {
    return this.#rpc(
      "verifyWebAuthnConnectAndMintBearer",
      { phygitalToken: this.#getToken() },
      async () => {
        try {
          await verifyConnectProof(
            {
              blockhash: input.blockhash,
              response: input.response,
            },
            {
              isBlockhashValid: async () =>
                (
                  await getSolanaRpc()
                    .isBlockhashValid(input.blockhash as Blockhash, {
                      commitment: "confirmed",
                    })
                    .send()
                ).value,
              consumeSignCount: ({ identifier, signCount, phygitalToken }) => {
                if (String(phygitalToken) !== this.#getToken()) return false;
                return this.#getStore().consumeAccessoryCounter(
                  "webauthn",
                  identifier,
                  signCount,
                );
              },
            },
          );
          return this.#mintVerifierBearer({
            origin: input.origin,
            ttlMs: input.ttlMs,
          });
        } catch (err) {
          return {
            ok: false as const,
            code: err instanceof ConnectProofError ? err.code : "invalid_proof",
            error: err instanceof Error ? err.message : "Invalid connect proof",
            status: err instanceof ConnectProofError ? err.status : 400,
          };
        }
      },
    );
  }

  /** Verify a dynamic NFC proof, consume it, and mint the bearer in this DO. */
  async verifyDynamicConnectAndMintBearer(input: {
    pk: string;
    s: string;
    c: string | number;
    n: string;
    origin: string | null;
    ttlMs: number;
  }): Promise<
    | { ok: true; accessToken: string; expiresAt: number; verifier: string }
    | { ok: false; code: string; error: string; status: number }
  > {
    return this.#rpc(
      "verifyDynamicConnectAndMintBearer",
      { phygitalToken: this.#getToken() },
      async () => {
        try {
          await verifyDynamicConnectProof(
            { pk: input.pk, s: input.s, c: input.c, n: input.n },
            {
              rpc: getSolanaRpc(),
              expectedPhygitalToken: this.#getToken() as Address,
              consumeCounter: ({ identifier, counter }) =>
                this.#getStore().consumeAccessoryCounter(
                  "tap",
                  identifier,
                  counter,
                ),
            },
          );
          return this.#mintVerifierBearer({
            origin: input.origin,
            ttlMs: input.ttlMs,
          });
        } catch (err) {
          return {
            ok: false as const,
            code: err instanceof ConnectProofError ? err.code : "invalid_proof",
            error: err instanceof Error ? err.message : "Invalid connect proof",
            status: err instanceof ConnectProofError ? err.status : 400,
          };
        }
      },
    );
  }

  async #mintVerifierBearer(input: {
    ttlMs: number;
    origin: string | null;
  }): Promise<
    | { ok: true; accessToken: string; expiresAt: number; verifier: string }
    | { ok: false; code: string; error: string; status: number }
  > {
    const signingVerifier = getRandomVerifier();
    const { accessToken, expiresAt } = await signVerifierBearer(
      {
        sub: this.#getToken(),
        iss: signingVerifier,
        origin: input.origin,
        ttlMs: input.ttlMs,
      },
      async (message) =>
        base64ToBytes(await this.#getBackend().sign(signingVerifier, message)),
    );
    return {
      ok: true as const,
      accessToken,
      expiresAt,
      verifier: signingVerifier,
    };
  }

  async isOwner(credentialId: string): Promise<boolean> {
    return this.#rpc(
      "isOwner",
      { phygitalToken: this.#getToken(), credentialId },
      async () => this.#getStore().isOwner(credentialId),
    );
  }

  /** Sole owner credential id, or null if unclaimed. */
  async getOwnerCredentialId(): Promise<string | null> {
    return this.#rpc(
      "getOwnerCredentialId",
      { phygitalToken: this.#getToken() },
      async () => this.#getStore().ownerCredentialId(),
    );
  }

  // --- claim owner (WebAuthn; api gates device session) ---

  async addOwner(
    input: AddOwnerInput & {
      challengeId: string;
      assertion: AuthenticationResponseJSON;
      origin: string;
    },
  ): Promise<AddOwnerResult> {
    return this.#rpc(
      "addOwner",
      {
        phygitalToken: this.#getToken(),
        credentialId: input.credentialId,
        challengeId: input.challengeId,
        origin: input.origin,
      },
      async () => {
        const auth = await verifyMutationAssertion({
          store: this.#getStore(),
          challengeId: input.challengeId,
          binding: { kind: "addOwner", credentialId: input.credentialId },
          assertion: input.assertion,
          origin: input.origin,
          claimantPublicKey: input.publicKey,
        });
        if (!auth.ok) {
          return { ok: false, code: auth.code, error: auth.error };
        }
        if (auth.credentialId !== input.credentialId) {
          return {
            ok: false,
            code: "device_invalid",
            error: "Couldn’t verify this phone",
          };
        }
        const result = this.#getStore().addOwner(input);
        if (!result.ok) {
          return {
            ok: false,
            code: "linked_elsewhere",
            error: "This accessory is linked to another phone.",
          };
        }
        return { ok: true };
      },
    );
  }

  // --- WebAuthn challenge ---

  async createMutationChallenge(input: {
    origin: string;
    binding: MutationBinding;
  }): Promise<
    MutationResult<{
      challengeId: string;
      options: Record<string, unknown>;
    }>
  > {
    return this.#rpc(
      "createMutationChallenge",
      {
        phygitalToken: this.#getToken(),
        origin: input.origin,
        bindingKind: input.binding.kind,
      },
      async () => {
        const built = await buildMutationOptions(
          this.#getStore(),
          input.origin,
          input.binding,
        );
        if (!built.ok) {
          return { ok: false, code: built.code, error: built.error };
        }
        return {
          ok: true,
          challengeId: built.challengeId,
          options: built.options as unknown as Record<string, unknown>,
        };
      },
    );
  }

  // --- policy mutations (WebAuthn) ---

  async setPolicy(input: {
    policy: PaymentsPolicyConfig;
    challengeId: string;
    assertion: AuthenticationResponseJSON;
    origin: string;
  }): Promise<MutationResult<{ policy: EffectivePolicy }>> {
    return this.#rpc(
      "setPolicy",
      {
        phygitalToken: this.#getToken(),
        challengeId: input.challengeId,
        origin: input.origin,
      },
      async () => {
        const policy = input.policy;
        const auth = await verifyMutationAssertion({
          store: this.#getStore(),
          challengeId: input.challengeId,
          binding: { kind: "setPolicy", policy },
          assertion: input.assertion,
          origin: input.origin,
        });
        if (!auth.ok) {
          return { ok: false, code: auth.code, error: auth.error };
        }
        const saved = this.#getStore().upsertPolicy(policy);
        if (!saved.ok) {
          return {
            ok: false,
            code: saved.code,
            error: saved.error,
            details: saved.details,
          };
        }
        return { ok: true, policy: this.#getStore().getEffectivePolicy() };
      },
    );
  }

  async clearPolicy(input: {
    challengeId: string;
    assertion: AuthenticationResponseJSON;
    origin: string;
  }): Promise<MutationResult<{ policy: EffectivePolicy }>> {
    return this.#rpc(
      "clearPolicy",
      {
        phygitalToken: this.#getToken(),
        challengeId: input.challengeId,
        origin: input.origin,
      },
      async () => {
        const auth = await verifyMutationAssertion({
          store: this.#getStore(),
          challengeId: input.challengeId,
          binding: { kind: "clearPolicy" },
          assertion: input.assertion,
          origin: input.origin,
        });
        if (!auth.ok) {
          return { ok: false, code: auth.code, error: auth.error };
        }
        this.#getStore().clearPolicyAndGrants();
        return { ok: true, policy: this.#getStore().getEffectivePolicy() };
      },
    );
  }

  async createGrant(input: {
    intentHash: string;
    ttlSeconds?: number;
    challengeId: string;
    assertion: AuthenticationResponseJSON;
    origin: string;
  }): Promise<
    MutationResult<{ grantId: string; expiresAt: number; intentHash: string }>
  > {
    return this.#rpc(
      "createGrant",
      {
        phygitalToken: this.#getToken(),
        intentHash: input.intentHash,
        challengeId: input.challengeId,
        origin: input.origin,
      },
      async () => {
        const intentHash = input.intentHash.trim();
        const auth = await verifyMutationAssertion({
          store: this.#getStore(),
          challengeId: input.challengeId,
          binding: { kind: "createGrant", intentHash },
          assertion: input.assertion,
          origin: input.origin,
        });
        if (!auth.ok) {
          return { ok: false, code: auth.code, error: auth.error };
        }
        const ttlSeconds = Math.min(
          Math.max(input.ttlSeconds ?? 300, 60),
          3600,
        );
        const grant = this.#getStore().createGrant(intentHash, ttlSeconds);
        this.#getStore().resolvePendingApproval(intentHash, "granted");
        return {
          ok: true,
          grantId: grant.grantId,
          expiresAt: grant.expiresAt,
          intentHash,
        };
      },
    );
  }

  /**
   * Current owner unlinks: require on-chain teardown → WebAuthn → wipe DO owner.
   * Token verifier override and recovery wallet PDAs must be closed first.
   */
  async removeOwnerAndClear(input: {
    challengeId: string;
    assertion: AuthenticationResponseJSON;
    origin: string;
  }): Promise<MutationResult<{ credentialId: string }>> {
    return this.#rpc(
      "removeOwnerAndClear",
      {
        phygitalToken: this.#getToken(),
        challengeId: input.challengeId,
        origin: input.origin,
      },
      () =>
        this.#withEnv(async () => {
          // Fail before consuming the WebAuthn challenge when teardown is incomplete.
          const pre = await assertOnChainUnlinkTeardown(this.#getToken());
          if (!pre.ok) {
            return {
              ok: false,
              code: pre.code,
              error: pre.error,
              details: pre.details,
            };
          }

          const auth = await verifyMutationAssertion({
            store: this.#getStore(),
            challengeId: input.challengeId,
            binding: { kind: "removeOwner" },
            assertion: input.assertion,
            origin: input.origin,
          });
          if (!auth.ok) {
            return { ok: false, code: auth.code, error: auth.error };
          }

          // Re-check after auth in case accounts were re-created during the prompt.
          const post = await assertOnChainUnlinkTeardown(this.#getToken());
          if (!post.ok) {
            return {
              ok: false,
              code: post.code,
              error: post.error,
              details: post.details,
            };
          }

          this.#getStore().clearOwnerAndPolicies();
          return { ok: true, credentialId: auth.credentialId };
        }),
    );
  }

  // --- fees ---

  async applyFeeEvents(
    events: FeeEvent[],
  ): Promise<{ applied: number; appliedSignatures: string[] }> {
    return this.#rpc(
      "applyFeeEvents",
      { phygitalToken: this.#getToken(), events: events.length },
      async () => {
        const appliedSignatures: string[] = [];
        for (const ev of events) {
          if (this.#getStore().applyFeeEvent(ev)) {
            appliedSignatures.push(ev.signature);
          }
        }
        return { applied: appliedSignatures.length, appliedSignatures };
      },
    );
  }

  // --- authorize + sign ---

  async previewAuthorize(input: {
    instructions: Instruction[];
    /** Bearer-bound origin (already === request Origin), or null for servers. */
    sessionOrigin?: string | null;
  }): Promise<PreviewAuthorizeResult> {
    return this.#rpc(
      "previewAuthorize",
      {
        phygitalToken: this.#getToken(),
        instructions: input.instructions.length,
      },
      () =>
        this.#withEnv(async () => {
          try {
            const phygitalToken = this.#getToken();
            await assertPreviewWalletSigner(phygitalToken, input.instructions);

            const result = await authorizeIntent({
              phygitalToken,
              instructions: input.instructions,
              mode: "preview",
              origin: input.sessionOrigin ?? null,
            });

            if (!result.ok) {
              return {
                ok: false as const,
                intentHash: result.intentHash,
                code: result.code,
                error: result.error,
                soft: result.soft,
                details: result.details,
              };
            }

            const fee = await assertFeeBalance({
              instructions: input.instructions,
            });
            if (!fee.ok) {
              return {
                ok: false as const,
                code: fee.code,
                error: fee.error,
                soft: fee.soft,
                details: fee.details,
              };
            }

            return { ok: true as const, intentHash: result.intentHash };
          } catch (err) {
            const mapped = mapCodedVerifierError(err);
            return {
              ok: false as const,
              code: mapped.code,
              error: mapped.error,
              soft: mapped.soft,
              details: mapped.details,
              httpStatus: mapped.status,
            };
          }
        }),
    );
  }

  async signTransactions(
    wires: string[],
    auth: {
      /**
       * Canonical origin bound into the session bearer at connect. require-bearer
       * already verified it equals the live request Origin, so it is the single
       * origin the signer trusts: checked against the standing policy's
       * `allowedOrigins` inside authorizeIntent. Null for server-to-server callers.
       */
      sessionOrigin?: string | null;
    } = {},
  ): Promise<SignTransactionsResult> {
    return this.#rpc(
      "signTransactions",
      {
        phygitalToken: this.#getToken(),
        transactions: Array.isArray(wires) ? wires.length : 0,
      },
      () =>
        this.#withEnv(async () => {
          try {
            if (!Array.isArray(wires) || wires.length === 0) {
              return {
                ok: false as const,
                status: 400,
                body: {
                  error: "transactions required",
                  code: "invalid_transaction",
                  soft: false,
                },
              };
            }

            const backend = this.#getBackend();
            const signatures: string[] = [];
            let kindSeen: "execute" | "config" | null = null;
            let configActionSeen: DecodedSignTx["configAction"];
            let verifierSeen: string | null = null;
            let intentHashSeen: string | null = null;

            for (const wire of wires) {
              const decoded = decodeWireTransaction(wire);
              this.#bindToken(decoded.phygitalToken);
              verifierSeen = decoded.verifier;
              if (decoded.configAction) configActionSeen = decoded.configAction;

              if (kindSeen && kindSeen !== decoded.kind) {
                return {
                  ok: false as const,
                  status: 400,
                  body: {
                    error:
                      "Transaction batch mixes execute with a config change",
                    code: "unexpected_instruction",
                    soft: false,
                  },
                };
              }
              kindSeen = decoded.kind;

              if (!(await backend.canSign(decoded.verifier))) {
                return {
                  ok: false as const,
                  status: 403,
                  body: {
                    error:
                      "Transaction verifier does not match this signing service",
                    code: "verifier_mismatch",
                    soft: false,
                    details: {
                      got: decoded.verifier,
                      phygitalToken: decoded.phygitalToken,
                    },
                  },
                };
              }

              // Config and execute share one path: fee gate, then authorizeIntent
              // (standing policy + origin allowlist + soft-deny/grant). Config
              // always soft-denies in evaluatePolicy, so it proceeds only once
              // the owner has approved a one-time grant — the same override flow
              // as an over-cap execute. A config change must be its own tx.
              if (decoded.kind === "config" && wires.length !== 1) {
                return {
                  ok: false as const,
                  status: 400,
                  body: {
                    error: "A settings change must be its own transaction",
                    code: "invalid_transaction",
                    soft: false,
                  },
                };
              }

              const fee = await assertFeeBalance({
                instructions: decoded.instructions,
              });
              if (!fee.ok) {
                return {
                  ok: false as const,
                  status: 403,
                  body: {
                    error: fee.error,
                    code: fee.code,
                    soft: fee.soft,
                    details: {
                      ...fee.details,
                      phygitalToken: decoded.phygitalToken,
                    },
                  },
                };
              }

              const result = await authorizeIntent({
                phygitalToken: decoded.phygitalToken,
                instructions: decoded.instructions,
                mode: "sign",
                origin: auth.sessionOrigin ?? null,
              });
              intentHashSeen = result.intentHash;

              if (!result.ok) {
                return {
                  ok: false as const,
                  status: 403,
                  body: {
                    error: result.error,
                    code: result.code,
                    soft: result.soft,
                    details: {
                      ...result.details,
                      phygitalToken: decoded.phygitalToken,
                      intentHash: result.intentHash,
                    },
                  },
                };
              }

              signatures.push(
                await backend.sign(decoded.verifier, decoded.messageBytes),
              );
            }

            return {
              ok: true as const,
              signatures,
              audit:
                kindSeen && verifierSeen
                  ? {
                      kind: kindSeen,
                      configAction: configActionSeen,
                      verifier: verifierSeen,
                      intentHash: intentHashSeen,
                      signatureCount: signatures.length,
                    }
                  : undefined,
            };
          } catch (err) {
            const mapped = mapCodedVerifierError(err);
            return {
              ok: false as const,
              status: mapped.status,
              body: {
                error: mapped.error,
                code: mapped.code,
                soft: mapped.soft,
                details: mapped.details,
              },
            };
          }
        }),
    );
  }

  async recordSoftDeny(input: {
    intentHash: string;
    code: string;
    error: string;
    details?: Record<string, unknown>;
    /** Visitor device credential; omit/null when unauthenticated. */
    visitorCredentialId?: string | null;
  }): Promise<{ recorded: boolean }> {
    return this.#rpc(
      "recordSoftDeny",
      {
        phygitalToken: this.#getToken(),
        intentHash: input.intentHash,
      },
      async () => {
        const ownerId = this.#getStore().ownerCredentialId();
        if (!ownerId) return { recorded: false };
        const visitor = input.visitorCredentialId?.trim() || null;
        if (visitor && visitor === ownerId) return { recorded: false };

        this.#getStore().upsertPendingApproval({
          intentHash: input.intentHash,
          code: input.code,
          error: input.error,
          details: input.details,
        });
        return { recorded: true };
      },
    );
  }

  async listOpenApprovals(): Promise<{
    approvals: ReturnType<TokenStore["listOpenApprovals"]>;
  }> {
    return this.#rpc(
      "listOpenApprovals",
      { phygitalToken: this.#getToken() },
      async () => ({ approvals: this.#getStore().listOpenApprovals() }),
    );
  }

  async resolvePendingApproval(input: {
    intentHash: string;
    resolution: "granted" | "denied" | "cancelled";
  }): Promise<{ resolved: boolean }> {
    return this.#rpc(
      "resolvePendingApproval",
      {
        phygitalToken: this.#getToken(),
        intentHash: input.intentHash,
        resolution: input.resolution,
      },
      async () => ({
        resolved: this.#getStore().resolvePendingApproval(
          input.intentHash,
          input.resolution,
        ),
      }),
    );
  }
}
