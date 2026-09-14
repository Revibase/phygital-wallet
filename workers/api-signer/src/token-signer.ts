/**
 * TokenSigner Durable Object — per-phygitalToken paymaster.
 *
 * Owns the prepaid fee balance and the ed25519 fee-payer signature for
 * phygital-wallet transactions.
 * Hosted on revibase-verifier-signer.
 */
import { DurableObject } from "cloudflare:workers";
import { FeePayerSigner } from "@/backend/secrets";
import { assertFeeBalance } from "@/fees/fee-balance-gate";
import { coded, normalizeError } from "@/shared/errors";
import { initTokenSchema, TokenStore, type FeeEvent } from "@/token-store";
import { createLogger, Logger, withLoggedRpc } from "../../shared/log";
import { SignTransactionsResult } from "./transactions/signer-service";
import { decodeWireTransaction } from "./transactions/decode-tx";

/** Resolve DO name / token from Durable Object id (name-based ids). */
function tokenFromName(name: string | null | undefined): string {
  if (!name?.trim()) {
    throw coded(
      "TokenSigner requires idFromName(phygitalToken)",
      "signer_misconfigured",
    );
  }
  return name.trim();
}

export class TokenSigner extends DurableObject<Env> {
  #store: TokenStore | null = null;
  #backend: FeePayerSigner | null = null;
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
      throw coded("TokenSigner DO token mismatch", "token_mismatch");
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

  #getBackend(): FeePayerSigner {
    if (!this.#backend) {
      this.#backend = new FeePayerSigner(this.env.VERIFIER_SECRET_KEYS);
    }
    return this.#backend;
  }

  // --- reads (no auth) ---

  async getFeeBalance(): Promise<{ balanceLamports: number }> {
    return this.#rpc(
      "getFeeBalance",
      { phygitalToken: this.#getToken() },
      async () => ({
        balanceLamports: this.#getStore().getFeeBalanceLamports(),
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

  // --- fee-payer co-sign ---

  /**
   * Validate transaction shape, check the token's prepaid balance, and sign as
   * a configured fee payer.
   */
  async signTransactions(wires: string[]): Promise<SignTransactionsResult> {
    return this.#rpc(
      "signTransactions",
      {
        phygitalToken: this.#getToken(),
        transactions: Array.isArray(wires) ? wires.length : 0,
      },
      async () => {
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
          const accumulator = this.env.TOP_UP_ACCUMULATOR?.trim() ?? "";
          const signatures: string[] = [];
          let feePayerSeen: string | null = null;

          for (const wire of wires) {
            const decoded = decodeWireTransaction(wire, accumulator);
            this.#bindToken(decoded.phygitalToken);
            feePayerSeen = decoded.feePayer;

            if (!backend.canSign(decoded.feePayer)) {
              return {
                ok: false as const,
                status: 403,
                body: {
                  error:
                    "Transaction fee payer is not sponsored by this service",
                  code: "fee_payer_mismatch",
                  details: {
                    got: decoded.feePayer,
                    phygitalToken: decoded.phygitalToken,
                  },
                },
              };
            }

            // Top-ups fund the fee balance, so they must bypass the balance gate.
            if (!decoded.isFeePayingInstruction) {
              const fee = assertFeeBalance({
                balanceLamports: this.#getStore().getFeeBalanceLamports(),
              });
              if (!fee.ok) {
                return {
                  ok: false as const,
                  status: 403,
                  body: {
                    error: fee.error,
                    code: fee.code,
                    details: {
                      ...fee.details,
                      phygitalToken: decoded.phygitalToken,
                    },
                  },
                };
              }
            }

            signatures.push(
              await backend.sign(decoded.feePayer, decoded.messageBytes),
            );
          }

          return {
            ok: true as const,
            signatures,
            audit: feePayerSeen
              ? {
                  feePayer: feePayerSeen,
                  signatureCount: signatures.length,
                }
              : undefined,
          };
        } catch (err) {
          // A coded error keeps its own code/status; a bare throw is an
          // internal signer fault → 500, not client bad-input.
          const { error, code, status, details, soft } = normalizeError(err, {
            code: "signer_error",
            status: 500,
          });
          return {
            ok: false as const,
            status,
            body: { error, code, details, soft },
          };
        }
      },
    );
  }
}
