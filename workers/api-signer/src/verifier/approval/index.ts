/**
 * Standing policies + one-time grants for TokenSigner DO SQLite.
 */
import type { Instruction } from "@solana/kit";
import { hashIntent } from "@/verifier/intent-hash";
import { evaluatePolicy } from "@/verifier/approval/policy-engine";
import { getTokenStore } from "@/shared/request-context";

type AuthorizeRequest = {
  phygitalToken: string;
  instructions: readonly Instruction[];
  mode: "preview" | "sign";
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
  req: AuthorizeRequest,
): Promise<AuthorizeResult> {
  const store = getTokenStore();
  const intentHash = await hashIntent(req.phygitalToken, req.instructions);
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

  const verdict = evaluatePolicy(loaded, req.instructions);

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
