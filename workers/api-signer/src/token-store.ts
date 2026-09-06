/**
 * Per-token SQLite store for TokenSigner Durable Object.
 * One DO instance = one phygitalToken; tables omit the token column.
 */
import {
  validatePolicy,
  type PolicyDocument,
} from "phygital-verifier-sdk";

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
  policy: PolicyDocument | null;
  status: "none" | "ok" | "invalid";
};

const CHALLENGE_TTL_MS = 60_000; // short-lived mutation challenge


function stripToPolicyDocument(raw: unknown): PolicyDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.programs)) return null;

  const transaction =
    obj.transaction && typeof obj.transaction === "object"
      ? (obj.transaction as PolicyDocument["transaction"])
      : undefined;
  const version = typeof obj.version === "string" ? obj.version : undefined;

  return {
    ...(version ? { version } : {}),
    programs: obj.programs as PolicyDocument["programs"],
    ...(transaction ? { transaction } : {}),
  };
}

function parseStoredPolicy(policyJson: string): PolicyDocument | "invalid" {
  try {
    const cleaned = stripToPolicyDocument(JSON.parse(policyJson));
    if (!cleaned) return "invalid";
    const valid = validatePolicy(cleaned);
    return valid.ok ? cleaned : "invalid";
  } catch {
    return "invalid";
  }
}

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
  `);
}

export class TokenStore {
  /** undefined = not loaded; null/"invalid"/PolicyDocument = cached parse. */
  #policyCache: PolicyDocument | null | "invalid" | undefined = undefined;

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
    this.#policyCache = null;
  }

  /** Drop standing policy + grants only (owner stays). */
  clearPolicyAndGrants(): void {
    this.sql.exec(`DELETE FROM grants`);
    this.sql.exec(`DELETE FROM policy`);
    this.#policyCache = null;
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

  loadPolicyDocument(): PolicyDocument | null | "invalid" {
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

  upsertPolicy(
    policy: unknown,
  ):
    | { ok: true }
    | {
        ok: false;
        code: string;
        error: string;
        details?: Record<string, unknown>;
      } {
    const clean = stripToPolicyDocument(policy);
    if (!clean) {
      return {
        ok: false,
        code: "invalid_policy",
        error: "policy.programs must be an array",
      };
    }
    const valid = validatePolicy(clean);
    if (!valid.ok) {
      return {
        ok: false,
        code: valid.code,
        error: valid.message,
        details: valid.details,
      };
    }
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
