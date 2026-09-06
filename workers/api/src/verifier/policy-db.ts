import {
  validatePolicy,
  type PolicyDocument,
} from "phygital-verifier-sdk";
import { getD1 } from "@/shared/db";

/**
 * Reuse the same PolicyDocument object when D1 JSON is unchanged (cheap GET
 * identity for repeated reads in one isolate).
 */
const policyObjectCache = new Map<
  string,
  { json: string | null; policy: PolicyDocument | null | "invalid" }
>();

/** Keep SDK `PolicyDocument` fields only; reject malformed input. */
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

function invalidPolicy(message: string, code = "invalid_policy"): Error {
  return Object.assign(new Error(message), { code });
}

/** Stored JSON → document, or `"invalid"` (fail closed on authorize). */
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

/**
 * D1 standing policy, or `null` when none is configured (opt-in).
 * Corrupt rows return `"invalid"` for fail-closed authorize.
 */
export async function loadPolicyDocument(
  phygitalToken: string,
): Promise<PolicyDocument | null | "invalid"> {
  const row = await getD1()
    .prepare(
      `SELECT policy_json FROM token_policies WHERE phygital_token = ?`,
    )
    .bind(phygitalToken)
    .first<{ policy_json: string }>();

  const json = row?.policy_json ?? null;
  const hit = policyObjectCache.get(phygitalToken);
  if (hit && hit.json === json) return hit.policy;

  const policy = json == null ? null : parseStoredPolicy(json);
  policyObjectCache.set(phygitalToken, { json, policy });
  return policy;
}

export async function getEffectivePolicy(phygitalToken: string): Promise<{
  phygitalToken: string;
  policy: PolicyDocument | null;
  status: "none" | "ok" | "invalid";
}> {
  const loaded = await loadPolicyDocument(phygitalToken);
  if (loaded === "invalid") {
    return { phygitalToken, policy: null, status: "invalid" };
  }
  if (loaded == null) {
    return { phygitalToken, policy: null, status: "none" };
  }
  return { phygitalToken, policy: loaded, status: "ok" };
}

export async function upsertPolicyDocument(
  phygitalToken: string,
  policy: unknown,
): Promise<void> {
  const clean = stripToPolicyDocument(policy);
  if (!clean) {
    throw invalidPolicy("policy.programs must be an array");
  }
  const valid = validatePolicy(clean);
  if (!valid.ok) {
    throw Object.assign(new Error(valid.message), {
      code: valid.code,
      details: valid.details,
    });
  }
  const now = Date.now();
  const json = JSON.stringify(clean);
  await getD1()
    .prepare(
      `INSERT INTO token_policies (phygital_token, policy_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(phygital_token) DO UPDATE SET
         policy_json = excluded.policy_json,
         updated_at = excluded.updated_at`,
    )
    .bind(phygitalToken, json, now)
    .run();
  policyObjectCache.set(phygitalToken, { json, policy: clean });
}

/** Remove standing policy (limits off). */
export async function deletePolicyDocument(
  phygitalToken: string,
): Promise<void> {
  const d1 = getD1();
  await d1
    .prepare(`DELETE FROM one_time_grants WHERE phygital_token = ?`)
    .bind(phygitalToken)
    .run();
  await d1
    .prepare(`DELETE FROM pending_approvals WHERE phygital_token = ?`)
    .bind(phygitalToken)
    .run();
  await d1
    .prepare(`DELETE FROM token_policies WHERE phygital_token = ?`)
    .bind(phygitalToken)
    .run();
  policyObjectCache.set(phygitalToken, { json: null, policy: null });
}

export async function createGrant(args: {
  phygitalToken: string;
  intentHash: string;
  ttlSeconds: number;
}): Promise<{ grantId: string; expiresAt: number }> {
  const now = Date.now();
  const expiresAt = now + args.ttlSeconds * 1000;
  const grantId = crypto.randomUUID();
  await getD1()
    .prepare(
      `INSERT INTO one_time_grants
         (id, phygital_token, intent_hash, expires_at, consumed_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    )
    .bind(grantId, args.phygitalToken, args.intentHash, expiresAt, now)
    .run();

  await getD1()
    .prepare(
      `UPDATE pending_approvals
       SET resolved_at = ?
       WHERE phygital_token = ? AND intent_hash = ?
         AND resolved_at IS NULL`,
    )
    .bind(now, args.phygitalToken, args.intentHash)
    .run();

  return { grantId, expiresAt };
}
