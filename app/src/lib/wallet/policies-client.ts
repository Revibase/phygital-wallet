import { startAuthentication as startPlatformAuthentication } from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

import { queryFetch, readJson } from "@/lib/queries/http";
import type { PaymentsPolicyConfig } from "phygital-policy";

export type OpenApproval = {
  intentHash: string;
  code: string;
  error: string;
  details: Record<string, unknown> | null;
};

export type PolicyStatus = "none" | "ok" | "invalid";

export type EffectivePolicy = {
  policy: PaymentsPolicyConfig | null;
  status: PolicyStatus;
};

/** Owner mutation bindings used by the app (addOwner is claim-only). */
export type MutationBinding =
  | { kind: "setPolicy"; policy: PaymentsPolicyConfig }
  | { kind: "clearPolicy" }
  | { kind: "createGrant"; intentHash: string }
  | { kind: "removeOwner" };

/** Fetch DO-minted WebAuthn options bound to this write and collect assertion. */
export async function assertPolicyMutation(
  phygitalToken: string,
  binding: MutationBinding,
  cancelMessage = "Confirmation was cancelled"
): Promise<{ challengeId: string; assertion: AuthenticationResponseJSON }> {
  const optionsRes = await queryFetch(
    `/policies/${encodeURIComponent(phygitalToken)}/mutation-options`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(binding),
    }
  );
  const { challengeId, options } = await readJson<{
    challengeId: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }>(optionsRes, "Couldn’t start confirmation");
  try {
    const assertion = await startPlatformAuthentication({
      optionsJSON: options,
    });
    return { challengeId, assertion };
  } catch (e) {
    if (e instanceof Error && e.name === "NotAllowedError") {
      throw new Error(cancelMessage);
    }
    throw e;
  }
}

/** GET standing policy (owner session required). */
export async function fetchEffectivePolicy(
  phygitalToken: string
): Promise<EffectivePolicy> {
  const res = await queryFetch(
    `/policies/${encodeURIComponent(phygitalToken)}`
  );
  return readJson<EffectivePolicy>(res, "Couldn’t load settings");
}

/** PUT compiled PaymentsPolicyConfig with platform WebAuthn step-up. */
export async function putPaymentsPolicyConfig(
  phygitalToken: string,
  policy: PaymentsPolicyConfig
): Promise<EffectivePolicy> {
  const { challengeId, assertion } = await assertPolicyMutation(
    phygitalToken,
    { kind: "setPolicy", policy },
    "Save was cancelled"
  );
  const res = await queryFetch(
    `/policies/${encodeURIComponent(phygitalToken)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy, challengeId, assertion }),
    }
  );
  return readJson<EffectivePolicy>(res, "Couldn’t save settings");
}

/** DELETE standing policy (limits off) with platform WebAuthn step-up. */
export async function deletePaymentsPolicyConfig(
  phygitalToken: string
): Promise<EffectivePolicy> {
  const { challengeId, assertion } = await assertPolicyMutation(
    phygitalToken,
    { kind: "clearPolicy" },
    "Turn off was cancelled"
  );
  const res = await queryFetch(
    `/policies/${encodeURIComponent(phygitalToken)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, assertion }),
    }
  );
  return readJson<EffectivePolicy>(res, "Couldn’t turn off limits");
}

export async function createOneTimeGrant(
  phygitalToken: string,
  intentHash: string
): Promise<void> {
  const { challengeId, assertion } = await assertPolicyMutation(
    phygitalToken,
    { kind: "createGrant", intentHash },
    "Approve was cancelled"
  );
  const res = await queryFetch(
    `/policies/${encodeURIComponent(phygitalToken)}/grants`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentHash, challengeId, assertion }),
    }
  );
  await readJson(res, "Couldn’t approve this send");
}

/** Owner declines a pending soft-deny (session + isOwner; no WebAuthn). */
export async function denyOpenApproval(
  phygitalToken: string,
  intentHash: string
): Promise<void> {
  const res = await queryFetch(
    `/policies/${encodeURIComponent(phygitalToken)}/approvals/deny`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentHash }),
    }
  );
  await readJson(res, "Couldn’t deny this send");
}

export async function fetchOpenApprovals(
  phygitalToken: string
): Promise<OpenApproval[]> {
  const res = await queryFetch(
    `/policies/${encodeURIComponent(phygitalToken)}/approvals`
  );
  const body = await readJson<{ approvals: OpenApproval[] }>(
    res,
    "Couldn’t load approvals"
  );
  return body.approvals;
}
