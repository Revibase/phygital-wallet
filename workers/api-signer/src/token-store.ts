/**
 * Per-token SQLite store for TokenSigner Durable Object.
 * One DO instance = one phygitalToken; tables omit the token column.
 */
import type { PaymentsPolicyConfig } from "phygital-policy";

import { STARTER_FEE_BALANCE_LAMPORTS } from "@/fees/constants";
import { validatePaymentsPolicyConfig } from "@/payments-policy-config";
import { bytesToBase64Url } from "@/shared/crypto/base64";

type Sql = DurableObjectStorage["sql"];

type OwnerRow = {
  credentialId: string;
  publicKey: string;
  linkedAt: number;
  label: string | null;
  imageUrl: string | null;
  mint: string | null;
};

export type FeeEvent = {
  signature: string;
  kind: "credit" | "debit";
  lamports: number;
};

export type EffectivePolicy = {
  phygitalToken: string;
  policy: PaymentsPolicyConfig | null;
  status: "none" | "ok" | "invalid";
};

const CHALLENGE_TTL_MS = 60_000; // short-lived mutation challenge

/** Soft-deny inbox TTL (owner response window; before SlotHashes / NFC). */
export const PENDING_APPROVAL_TTL_MS = 5 * 60 * 1000;
const MAX_OPEN_PENDING = 5;

/**
 * Terminal inbox states. The DO deletes rows on resolve/expire; the durable
 * audit trail (create + terminal) lives in the centralized D1 audit_log.
 */
export type ApprovalResolutionStatus =
  "granted" | "denied" | "cancelled" | "expired";

/** Open inbox row — only what the owner sheet needs. */
export type PendingApproval = {
  intentHash: string;
  code: string;
  error: string;
  details: Record<string, unknown> | null;
};

function parseStoredPolicy(
  policyJson: string,
): PaymentsPolicyConfig | "invalid" {
  try {
    const parsed = JSON.parse(policyJson) as unknown;
    const valid = validatePaymentsPolicyConfig(parsed);
    return valid.ok ? valid.config : "invalid";
  } catch {
    return "invalid";
  }
}

/**
 * Which monotonic counter a proof carries. `tap` is the dynamic NFC URL's `c`;
 * `webauthn` is the assertion's `signCount`. Separate registers, separate rows.
 */
export type AccessoryCounterKind = "tap" | "webauthn";

export function initTokenSchema(sql: Sql): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS owner (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      credential_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      linked_at INTEGER NOT NULL,
      label TEXT,
      image_url TEXT,
      mint TEXT
    );
    CREATE TABLE IF NOT EXISTS policy (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      policy_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS grants (
      id TEXT PRIMARY KEY NOT NULL,
      intent_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS grants_intent_open
      ON grants (intent_hash) WHERE consumed_at IS NULL;
    CREATE TABLE IF NOT EXISTS fee_balance (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      balance_lamports INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fee_events (
      signature TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      lamports INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY NOT NULL,
      nonce TEXT NOT NULL,
      binding_hash TEXT NOT NULL,
      origin TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accessory_counter (
      kind TEXT NOT NULL,
      identifier TEXT NOT NULL,
      c INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (kind, identifier)
    );
    CREATE TABLE IF NOT EXISTS pending_approvals (
      id TEXT PRIMARY KEY NOT NULL,
      intent_hash TEXT NOT NULL,
      code TEXT NOT NULL,
      error TEXT NOT NULL,
      details_json TEXT,
      expires_at INTEGER NOT NULL,
      resolved_at INTEGER,
      resolution TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS pending_approvals_intent_open
      ON pending_approvals (intent_hash) WHERE resolved_at IS NULL;
    CREATE INDEX IF NOT EXISTS pending_approvals_open_expires
      ON pending_approvals (expires_at) WHERE resolved_at IS NULL;
  `);
}

export class TokenStore {
  /** undefined = not loaded; null/"invalid"/PaymentsPolicyConfig = cached parse. */
  #policyCache: PaymentsPolicyConfig | null | "invalid" | undefined = undefined;

  constructor(
    private readonly sql: Sql,
    private readonly phygitalToken: string,
  ) {}

  ensureToken(token: string): void {
    const existing = this.sql
      .exec<{ value: string }>(
        `SELECT value FROM meta WHERE key = 'phygital_token'`,
      )
      .toArray()[0];
    if (existing) {
      if (existing.value !== token) {
        throw Object.assign(new Error("TokenSigner DO token mismatch"), {
          code: "token_mismatch",
        });
      }
      return;
    }
    this.sql.exec(
      `INSERT INTO meta (key, value) VALUES ('phygital_token', ?)`,
      token,
    );
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO fee_balance (id, balance_lamports, updated_at) VALUES (1, ?, ?)`,
      STARTER_FEE_BALANCE_LAMPORTS,
      now,
    );
  }

  // --- current owner only (no history) ---

  /** Current owner, or null when unclaimed. */
  getCurrentOwner(): OwnerRow | null {
    const row = this.sql
      .exec<{
        credential_id: string;
        public_key: string;
        linked_at: number;
        label: string | null;
        image_url: string | null;
        mint: string | null;
      }>(
        `SELECT credential_id, public_key, linked_at, label, image_url, mint
         FROM owner WHERE id = 1`,
      )
      .toArray()[0];
    if (!row) return null;
    return {
      credentialId: row.credential_id,
      publicKey: row.public_key,
      linkedAt: row.linked_at,
      label: row.label,
      imageUrl: row.image_url,
      mint: row.mint,
    };
  }

  getOwner(credentialId: string): OwnerRow | null {
    const owner = this.getCurrentOwner();
    if (!owner || owner.credentialId !== credentialId) return null;
    return owner;
  }

  hasOwner(): boolean {
    return this.getCurrentOwner() != null;
  }

  isOwner(credentialId: string): boolean {
    return this.getOwner(credentialId) != null;
  }

  /** Credential id of the sole owner, if any. */
  ownerCredentialId(): string | null {
    return this.getCurrentOwner()?.credentialId ?? null;
  }

  /**
   * Set the current owner. Exactly one at a time; no history of past owners.
   * If another credential owns the token → `linked_elsewhere`
   * (they must unlink first). Same credential may refresh pubkey/metadata.
   */
  addOwner(args: {
    credentialId: string;
    publicKey: string;
    label?: string | null;
    imageUrl?: string | null;
    mint?: string | null;
  }): { ok: true } | { ok: false; code: "linked_elsewhere" } {
    const current = this.getCurrentOwner();
    if (current && current.credentialId !== args.credentialId) {
      return { ok: false, code: "linked_elsewhere" };
    }
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO owner
         (id, credential_id, public_key, linked_at, label, image_url, mint)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         credential_id = excluded.credential_id,
         public_key = excluded.public_key,
         label = COALESCE(excluded.label, owner.label),
         image_url = COALESCE(excluded.image_url, owner.image_url),
         mint = COALESCE(excluded.mint, owner.mint)`,
      args.credentialId,
      args.publicKey,
      now,
      args.label ?? null,
      args.imageUrl ?? null,
      args.mint ?? null,
    );
    return { ok: true };
  }

  /**
   * Unlink: clear current owner (no history kept) and wipe policies/grants.
   * Token becomes unclaimed; a new owner may then `addOwner`.
   */
  clearOwnerAndPolicies(): void {
    this.sql.exec(`DELETE FROM owner`);
    this.sql.exec(`DELETE FROM grants`);
    this.sql.exec(`DELETE FROM policy`);
    this.sql.exec(`DELETE FROM challenges`);
    this.sql.exec(`DELETE FROM pending_approvals`);
    this.#policyCache = null;
  }

  /** Drop standing policy + grants only (owner stays). */
  clearPolicyAndGrants(): void {
    this.sql.exec(`DELETE FROM grants`);
    this.sql.exec(`DELETE FROM policy`);
    this.sql.exec(`DELETE FROM pending_approvals`);
    this.#policyCache = null;
  }

  // --- accessory replay counters ---

  /**
   * Check-and-advance an accessory counter high-water. Returns `false` to reject
   * as a replay.
   *
   * Each proof type carries its own monotonic counter from the chip, and they are
   * **separate registers** — the dynamic URL's `c` and the WebAuthn assertion's
   * `signCount` hold unrelated values, so they are tracked under different
   * `kind`s. Sharing one row would let the higher counter permanently lock out
   * the other proof type.
   *
   */
  consumeAccessoryCounter(
    kind: AccessoryCounterKind,
    identifier: string,
    counter: number,
  ): boolean {
    const stored = this.sql
      .exec<{ c: number }>(
        `SELECT c FROM accessory_counter WHERE kind = ? AND identifier = ?`,
        kind,
        identifier,
      )
      .toArray()[0];

    const floor = stored?.c ?? null;
    if (floor !== null && counter <= floor) return false;

    this.sql.exec(
      `INSERT INTO accessory_counter (kind, identifier, c, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(kind, identifier) DO UPDATE SET
         c = excluded.c,
         updated_at = excluded.updated_at`,
      kind,
      identifier,
      counter,
      Date.now(),
    );
    return true;
  }

  // --- challenges ---

  /**
   * Mint a short-TTL challenge bound to `bindingHash`.
   * WebAuthn challenge = SHA-256(nonce ‖ bindingHash).
   */
  async createChallenge(
    origin: string,
    bindingHash: string,
  ): Promise<{ id: string; challenge: string }> {
    const id = crypto.randomUUID();
    const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = bytesToBase64Url(nonceBytes);
    const challenge = await sha256Base64Url(`${nonce}:${bindingHash}`);
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;
    this.sql.exec(`DELETE FROM challenges WHERE expires_at < ?`, Date.now());
    this.sql.exec(
      `INSERT INTO challenges (id, nonce, binding_hash, origin, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      nonce,
      bindingHash,
      origin,
      expiresAt,
    );
    return { id, challenge };
  }

  /**
   * Look up by id, enforce TTL/origin/binding, delete (single use).
   * Returns the WebAuthn challenge derived from stored nonce + binding.
   */
  async consumeChallenge(
    id: string,
    origin: string,
    bindingHash: string,
  ): Promise<{ challenge: string } | null> {
    const row = this.sql
      .exec<{
        id: string;
        nonce: string;
        binding_hash: string;
        origin: string;
        expires_at: number;
      }>(
        `SELECT id, nonce, binding_hash, origin, expires_at FROM challenges
         WHERE id = ? LIMIT 1`,
        id,
      )
      .toArray()[0];
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.sql.exec(`DELETE FROM challenges WHERE id = ?`, row.id);
      return null;
    }
    if (row.origin !== origin) return null;
    if (row.binding_hash !== bindingHash) return null;
    this.sql.exec(`DELETE FROM challenges WHERE id = ?`, row.id);
    const challenge = await sha256Base64Url(`${row.nonce}:${row.binding_hash}`);
    return { challenge };
  }

  // --- policy ---

  loadPolicyDocument(): PaymentsPolicyConfig | null | "invalid" {
    if (this.#policyCache !== undefined) return this.#policyCache;
    const row = this.sql
      .exec<{ policy_json: string }>(
        `SELECT policy_json FROM policy WHERE id = 1`,
      )
      .toArray()[0];
    if (!row) {
      this.#policyCache = null;
      return null;
    }
    const parsed = parseStoredPolicy(row.policy_json);
    this.#policyCache = parsed;
    return parsed;
  }

  getEffectivePolicy(): EffectivePolicy {
    const loaded = this.loadPolicyDocument();
    if (loaded === "invalid") {
      return {
        phygitalToken: this.phygitalToken,
        policy: null,
        status: "invalid",
      };
    }
    if (loaded == null) {
      return {
        phygitalToken: this.phygitalToken,
        policy: null,
        status: "none",
      };
    }
    return {
      phygitalToken: this.phygitalToken,
      policy: loaded,
      status: "ok",
    };
  }

  upsertPolicy(policy: unknown):
    | { ok: true }
    | {
        ok: false;
        code: string;
        error: string;
        details?: Record<string, unknown>;
      } {
    const valid = validatePaymentsPolicyConfig(policy);
    if (!valid.ok) {
      return {
        ok: false,
        code: valid.code,
        error: valid.message,
      };
    }
    const clean = valid.config;
    const now = Date.now();
    const json = JSON.stringify(clean);
    this.sql.exec(
      `INSERT INTO policy (id, policy_json, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         policy_json = excluded.policy_json,
         updated_at = excluded.updated_at`,
      json,
      now,
    );
    this.#policyCache = clean;
    return { ok: true };
  }

  // --- grants ---

  findValidGrant(intentHash: string, now = Date.now()): { id: string } | null {
    const row = this.sql
      .exec<{ id: string }>(
        `SELECT id FROM grants
         WHERE intent_hash = ? AND consumed_at IS NULL AND expires_at > ?
         LIMIT 1`,
        intentHash,
        now,
      )
      .toArray()[0];
    return row ?? null;
  }

  createGrant(
    intentHash: string,
    ttlSeconds: number,
  ): { grantId: string; expiresAt: number } {
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;
    const grantId = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO grants (id, intent_hash, expires_at, consumed_at, created_at)
       VALUES (?, ?, ?, NULL, ?)`,
      grantId,
      intentHash,
      expiresAt,
      now,
    );
    return { grantId, expiresAt };
  }

  /** Consume only if an open grant exists; returns whether one was consumed. */
  tryConsumeGrant(intentHash: string, now = Date.now()): boolean {
    const open = this.findValidGrant(intentHash, now);
    if (!open) return false;
    this.sql.exec(
      `UPDATE grants SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`,
      now,
      open.id,
    );
    return true;
  }

  // --- soft-deny inbox (UX only; never authorizes spend) ---
  //
  // Only *open* rows live here now (owner inbox). The durable audit history —
  // create + terminal transitions — is written to the centralized D1 audit_log
  // by the api worker, so terminal rows are DELETEd here to keep the DO light.

  /** Drop expired open rows — history already mirrored to D1. */
  gcPendingApprovals(now = Date.now()): void {
    this.sql.exec(`DELETE FROM pending_approvals WHERE expires_at < ?`, now);
  }

  upsertPendingApproval(args: {
    intentHash: string;
    code: string;
    error: string;
    details?: Record<string, unknown>;
  }): void {
    const now = Date.now();
    this.gcPendingApprovals(now);
    const expiresAt = now + PENDING_APPROVAL_TTL_MS;
    const detailsJson =
      args.details != null ? JSON.stringify(args.details) : null;
    const intentHash = args.intentHash.trim();

    const openRow = this.sql
      .exec<{ id: string }>(
        `SELECT id FROM pending_approvals
         WHERE intent_hash = ? AND resolved_at IS NULL AND expires_at > ?
         LIMIT 1`,
        intentHash,
        now,
      )
      .toArray()[0];
    if (openRow) {
      this.sql.exec(
        `UPDATE pending_approvals
         SET code = ?, error = ?, details_json = ?, expires_at = ?
         WHERE id = ?`,
        args.code,
        args.error,
        detailsJson,
        expiresAt,
        openRow.id,
      );
      return;
    }

    const open = this.sql
      .exec<{ id: string }>(
        `SELECT id FROM pending_approvals
         WHERE resolved_at IS NULL AND expires_at > ?
         ORDER BY created_at ASC`,
        now,
      )
      .toArray();
    const overflow = open.length - (MAX_OPEN_PENDING - 1);
    if (overflow > 0) {
      for (const row of open.slice(0, overflow)) {
        this.#deleteRow(row.id);
      }
    }

    this.sql.exec(
      `INSERT INTO pending_approvals
         (id, intent_hash, code, error, details_json,
          expires_at, resolved_at, resolution, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      crypto.randomUUID(),
      intentHash,
      args.code,
      args.error,
      detailsJson,
      expiresAt,
      now,
    );
  }

  listOpenApprovals(now = Date.now()): PendingApproval[] {
    const rows = this.sql
      .exec<{
        intent_hash: string;
        code: string;
        error: string;
        details_json: string | null;
      }>(
        `SELECT intent_hash, code, error, details_json
         FROM pending_approvals
         WHERE resolved_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC
         LIMIT ?`,
        now,
        MAX_OPEN_PENDING,
      )
      .toArray();

    return rows.map((row) => ({
      intentHash: row.intent_hash,
      code: row.code,
      error: row.error,
      details: row.details_json
        ? (JSON.parse(row.details_json) as Record<string, unknown>)
        : null,
    }));
  }

  /**
   * Close an open inbox row. `resolution` is retained in the signature so the
   * api worker can log the terminal state to D1; the DO simply deletes the row.
   */
  resolvePendingApproval(
    intentHash: string,
    _resolution: ApprovalResolutionStatus,
    _now = Date.now(),
  ): boolean {
    const open = this.sql
      .exec<{ id: string }>(
        `SELECT id FROM pending_approvals
         WHERE intent_hash = ? AND resolved_at IS NULL
         LIMIT 1`,
        intentHash.trim(),
      )
      .toArray()[0];
    if (!open) return false;
    this.#deleteRow(open.id);
    return true;
  }

  /** Terminal transition — drop the row (history lives in D1). */
  #deleteRow(id: string): void {
    this.sql.exec(`DELETE FROM pending_approvals WHERE id = ?`, id);
  }

  // --- fees ---

  getFeeBalanceLamports(): number {
    const row = this.sql
      .exec<{ balance_lamports: number }>(
        `SELECT balance_lamports FROM fee_balance WHERE id = 1`,
      )
      .toArray()[0];
    return row?.balance_lamports ?? 0;
  }

  applyFeeEvent(event: FeeEvent): boolean {
    if (event.lamports <= 0) return false;
    const existing = this.sql
      .exec<{ signature: string }>(
        `SELECT signature FROM fee_events WHERE signature = ?`,
        event.signature,
      )
      .toArray()[0];
    if (existing) return false;

    const now = Date.now();
    this.sql.exec(
      `INSERT INTO fee_events (signature, kind, lamports, created_at)
       VALUES (?, ?, ?, ?)`,
      event.signature,
      event.kind,
      event.lamports,
      now,
    );

    const current = this.getFeeBalanceLamports();
    const next =
      event.kind === "credit"
        ? current + event.lamports
        : Math.max(0, current - event.lamports);
    this.sql.exec(
      `INSERT INTO fee_balance (id, balance_lamports, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         balance_lamports = excluded.balance_lamports,
         updated_at = excluded.updated_at`,
      next,
      now,
    );
    return true;
  }
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}
