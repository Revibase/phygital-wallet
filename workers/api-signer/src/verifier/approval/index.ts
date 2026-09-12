/**
 * Standing policies + one-time grants for TokenSigner DO SQLite.
 */
import type { Instruction } from "@solana/kit";
import { hashIntent } from "@/verifier/intent-hash";
import { evaluatePolicy } from "@/verifier/approval/policy-engine";
import { checkOriginAllowed } from "@/verifier/approval/origin-allowlist";
import { hashConfigIntent, parseConfigIntent } from "@/verifier/config-intent";
import { getTokenStore } from "@/shared/request-context";

type AuthorizeRequest = {
  phygitalToken: string;
  instructions: readonly Instruction[];
  mode: "preview" | "sign";
  /**
   * Canonical origin bound into the session bearer (require-bearer verified it
   * equals the request Origin), or null for server callers. Checked against the
   * standing policy's `allowedOrigins` — the same gate for `/preview` and
   * `/sign`, since both authorize the execute intent through here.
   */
  origin: string | null;
};

type AuthorizeResult =
  | { ok: true; intentHash: string }
  | {
      ok: false;
      intentHash: string;
      code: string;
      error: string;
      soft: boolean;
      details?: Record<string, unknown>;
    };

export async function authorizeIntent(
  req: AuthorizeRequest
): Promise<AuthorizeResult> {
  const store = getTokenStore();
  // Config changes hash by their canonical intent (action + semantic params),
  // NOT by raw instruction bytes — so the owner's grant is independent of the
  // Secp256r1 proof / slotNumber added when the tx is built after the grant.
  // A single wallet config ix is the only shape that yields a ConfigIntent.
  const configIntent =
    req.instructions.length === 1
      ? parseConfigIntent(req.instructions[0]!)
      : null;
  const intentHash = configIntent
    ? await hashConfigIntent(configIntent)
    : await hashIntent(req.phygitalToken, req.instructions);
  const loaded = store.loadPolicyDocument();

  if (loaded === "invalid") {
    return {
      ok: false,
      intentHash,
      code: "invalid_policy",
      error: "Standing policy is invalid and must be fixed by the owner.",
      soft: false,
    };
  }

  // Verdict precedence, all clearable by a one-time grant (the shared soft-deny
  // → owner-approval path):
  //   1. Origin allowlist — an unlisted site's intent lands in the inbox.
  //   2. Config change — always needs explicit owner approval, even with no
  //      standing policy. Detected once here; a config ix mixed with siblings
  //      has no ConfigIntent and falls to evaluatePolicy, which hard-denies the
  //      wallet program, so it can never be grant-approved as a config change.
  //   3. Otherwise the standing instruction policy (spend caps, etc.).
  const originVerdict = checkOriginAllowed(loaded, req.origin);
  const verdict = !originVerdict.ok
    ? {
        ok: false as const,
        soft: true,
        code: originVerdict.code,
        error: originVerdict.error,
        details: { origin: originVerdict.origin },
      }
    : configIntent
    ? {
        ok: false as const,
        soft: true,
        code: "config_change",
        error: "This change to your item’s settings needs your approval.",
      }
    : evaluatePolicy(loaded, req.instructions);

  if (verdict.ok) {
    return { ok: true, intentHash };
  }

  if (!verdict.soft) {
    return {
      ok: false,
      intentHash,
      code: verdict.code,
      error: verdict.error,
      soft: false,
      details: verdict.details,
    };
  }

  if (req.mode === "preview") {
    const grant = store.findValidGrant(intentHash);
    if (grant) return { ok: true, intentHash };
  } else if (store.tryConsumeGrant(intentHash)) {
    return { ok: true, intentHash };
  }

  return {
    ok: false,
    intentHash,
    code: verdict.code,
    error: verdict.error,
    soft: true,
    details: verdict.details,
  };
}
