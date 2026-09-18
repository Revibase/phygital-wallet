/**
 * TokenSigner Durable Object — per-token fee ledger + shared fee-payer cosign.
 * Hosted on revibase-token-signer.
 */
import { DurableObject } from "cloudflare:workers";
import { FeePayerSigner } from "@/backend/secrets";
import {
  FEE_RESERVE_TTL_MS,
  MIN_ATTEMPT_FEE_LAMPORTS,
} from "@/fees/constants";
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

async function messageReserveId(messageBytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", messageBytes),
  );
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function releaseReserves(store: TokenStore, ids: string[]): void {
  for (const id of ids) {
    try {
      store.release(id);
    } catch {
      /* best-effort rollback */
    }
  }
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
      this.#backend = new FeePayerSigner(this.env.FEE_PAYER_SECRET_KEYS);
    }
    return this.#backend;
  }

  async #scheduleReserveAlarm(): Promise<void> {
    const next = this.#getStore().nextReserveExpiry();
    if (next != null) {
      await this.ctx.storage.setAlarm(next);
    }
  }

  async alarm(): Promise<void> {
    const store = this.#getStore();
    const released = store.expireReserves(Date.now());
    if (released > 0) {
      this.#log().info("fee.reserves_expired", { released });
    }
    await this.#scheduleReserveAlarm();
  }

  // --- reads (no auth) ---

  async getFeeBalance(): Promise<{
    balanceLamports: number;
    reservedLamports: number;
    availableLamports: number;
  }> {
    return this.#rpc(
      "getFeeBalance",
      { phygitalToken: this.#getToken() },
      async () => {
        const store = this.#getStore();
        store.expireReserves();
        const balanceLamports = store.getFeeBalanceLamports();
        const reservedLamports = store.getReservedLamports();
        return {
          balanceLamports,
          reservedLamports,
          availableLamports: Math.max(0, balanceLamports - reservedLamports),
        };
      },
    );
  }

  async applyFeeEvents(
    events: FeeEvent[],
  ): Promise<{ applied: number; appliedSignatures: string[] }> {
    return this.#rpc(
      "applyFeeEvents",
      { phygitalToken: this.#getToken(), events: events.length },
      async () => {
        const appliedSignatures: string[] = [];
        for (const ev of events) {
          const applied =
            ev.kind === "debit"
              ? this.#getStore().settleDebit(ev)
              : this.#getStore().applyFeeEvent(ev);
          if (applied) {
            appliedSignatures.push(ev.signature);
          }
        }
        await this.#scheduleReserveAlarm();
        return { applied: appliedSignatures.length, appliedSignatures };
      },
    );
  }

  /**
   * Validate transaction shape, reserve prepaid fee (unless top-up), and sign
   * as a configured fee payer. Reserves settle on webhook debit or TTL alarm.
   */
  async signTransactions(wires: string[]): Promise<SignTransactionsResult> {
    return this.#rpc(
      "signTransactions",
      {
        phygitalToken: this.#getToken(),
        transactions: Array.isArray(wires) ? wires.length : 0,
      },
      async () => {
        const reservedIds: string[] = [];
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
          const store = this.#getStore();
          store.expireReserves();

          for (const wire of wires) {
            const decoded = decodeWireTransaction(wire, accumulator);
            this.#bindToken(decoded.phygitalToken);
            feePayerSeen = decoded.feePayer;

            if (!backend.canSign(decoded.feePayer)) {
              releaseReserves(store, reservedIds);
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
              const reserveId = await messageReserveId(decoded.messageBytes);
              if (
                !store.reserve(
                  reserveId,
                  MIN_ATTEMPT_FEE_LAMPORTS,
                  FEE_RESERVE_TTL_MS,
                )
              ) {
                releaseReserves(store, reservedIds);
                return {
                  ok: false as const,
                  status: 403,
                  body: {
                    error: "Fee balance is too low for this transaction",
                    code: "insufficient_fee_balance",
                    details: {
                      availableLamports: store.getAvailableLamports(),
                      requiredLamports: MIN_ATTEMPT_FEE_LAMPORTS,
                      phygitalToken: decoded.phygitalToken,
                    },
                  },
                };
              }
              reservedIds.push(reserveId);
              const signature = await backend.sign(
                decoded.feePayer,
                decoded.messageBytes,
              );
              store.rebindReserve(reserveId, signature);
              // Track the rebound id for rollback on later failure.
              reservedIds[reservedIds.length - 1] = signature;
              signatures.push(signature);
            } else {
              signatures.push(
                await backend.sign(decoded.feePayer, decoded.messageBytes),
              );
            }
          }

          await this.#scheduleReserveAlarm();

          return {
            ok: true as const,
            signatures,
            audit: feePayerSeen
              ? {
                  feePayer: feePayerSeen,
                  signatureCount: signatures.length,
                  reserved: reservedIds.length,
                }
              : undefined,
          };
        } catch (err) {
          releaseReserves(this.#getStore(), reservedIds);
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
