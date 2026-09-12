import { Hono, type Context } from "hono";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { PaymentsPolicyConfig } from "phygital-policy";

import { auditMeta, recordAudit } from "@/audit/audit-log";
import { requireDeviceSession } from "@/auth/device-session";
import { parseMutationBinding } from "@/auth/mutation-binding";
import { json } from "@/shared/http";
import { tokenSigner, type TokenSignerRpc } from "@/verifier/token-signer";

export const policyRoutes = new Hono<{ Bindings: Env }>();

function requestOrigin(c: Context): string | null {
  return c.req.header("Origin") ?? null;
}

async function requireOwnerSession(c: Context<{ Bindings: Env }>): Promise<
  | Response
  | {
      session: { credentialId: string };
      phygitalToken: string;
      stub: TokenSignerRpc;
    }
> {
  const session = await requireDeviceSession(c);
  if (session instanceof Response) return session;

  const phygitalToken = c.req.param("phygitalToken")?.trim();
  if (!phygitalToken) {
    return json(
      { error: "Missing phygitalToken", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const stub = tokenSigner(c.env, phygitalToken);
  if (!(await stub.isOwner(session.credentialId))) {
    return json(
      { error: "Only the owner phone can do this.", code: "not_owner" },
      { status: 403 },
    );
  }

  return { session, phygitalToken, stub };
}

policyRoutes.get("/policies/:phygitalToken", async (c) => {
  const owner = await requireOwnerSession(c);
  if (owner instanceof Response) return owner;
  return json(await owner.stub.getPolicy());
});

policyRoutes.post("/policies/:phygitalToken/mutation-options", async (c) => {
  const owner = await requireOwnerSession(c);
  if (owner instanceof Response) return owner;

  const origin = requestOrigin(c);
  if (!origin) {
    return json(
      { error: "Unsupported origin", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const binding = parseMutationBinding(await c.req.json().catch(() => null));
  if (!binding) {
    return json(
      {
        error: "Valid owner mutation binding required",
        code: "invalid_transaction",
      },
      { status: 400 },
    );
  }

  const result = await owner.stub.createMutationChallenge({ origin, binding });
  if (!result.ok) {
    return json(
      { error: result.error, code: result.code },
      { status: result.code === "not_owner" ? 403 : 400 },
    );
  }
  return json({ challengeId: result.challengeId, options: result.options });
});

policyRoutes.put("/policies/:phygitalToken", async (c) => {
  const owner = await requireOwnerSession(c);
  if (owner instanceof Response) return owner;

  const origin = requestOrigin(c);
  if (!origin) {
    return json(
      { error: "Unsupported origin", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const body = (await c.req.json()) as {
    policy?: unknown;
    challengeId?: string;
    assertion?: AuthenticationResponseJSON;
  };

  if (!body.policy || !body.challengeId || !body.assertion) {
    return json(
      {
        error: "policy, challengeId and assertion required",
        code: "invalid_transaction",
      },
      { status: 400 },
    );
  }

  const result = await owner.stub.setPolicy({
    policy: body.policy as PaymentsPolicyConfig,
    challengeId: body.challengeId,
    assertion: body.assertion,
    origin,
  });
  if (!result.ok) {
    const status =
      result.code === "not_owner" || result.code === "device_invalid"
        ? 403
        : 400;
    return json(
      { error: result.error, code: result.code, details: result.details },
      { status },
    );
  }
  recordAudit({
    event: "policy_set",
    phygitalToken: owner.phygitalToken,
    ok: true,
    actor: "owner_device",
    credentialId: owner.session.credentialId,
    ...auditMeta(c),
  });
  return json(result.policy);
});

policyRoutes.delete("/policies/:phygitalToken", async (c) => {
  const owner = await requireOwnerSession(c);
  if (owner instanceof Response) return owner;

  const origin = requestOrigin(c);
  if (!origin) {
    return json(
      { error: "Unsupported origin", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    challengeId?: string;
    assertion?: AuthenticationResponseJSON;
  };
  if (!body.challengeId || !body.assertion) {
    return json(
      {
        error: "challengeId and assertion required",
        code: "invalid_transaction",
      },
      { status: 400 },
    );
  }

  const result = await owner.stub.clearPolicy({
    challengeId: body.challengeId,
    assertion: body.assertion,
    origin,
  });
  if (!result.ok) {
    return json({ error: result.error, code: result.code }, { status: 403 });
  }
  // Inbox cleared inside DO clearPolicyAndGrants.
  recordAudit({
    event: "policy_clear",
    phygitalToken: owner.phygitalToken,
    ok: true,
    actor: "owner_device",
    credentialId: owner.session.credentialId,
    ...auditMeta(c),
  });
  return json(result.policy);
});

policyRoutes.post("/policies/:phygitalToken/grants", async (c) => {
  const owner = await requireOwnerSession(c);
  if (owner instanceof Response) return owner;

  const origin = requestOrigin(c);
  if (!origin) {
    return json(
      { error: "Unsupported origin", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const body = (await c.req.json()) as {
    intentHash?: string;
    ttlSeconds?: number;
    challengeId?: string;
    assertion?: AuthenticationResponseJSON;
  };
  const intentHash = body.intentHash?.trim();
  if (!intentHash || !body.challengeId || !body.assertion) {
    return json(
      {
        error: "intentHash, challengeId and assertion required",
        code: "invalid_transaction",
      },
      { status: 400 },
    );
  }

  const result = await owner.stub.createGrant({
    intentHash,
    ttlSeconds: body.ttlSeconds,
    challengeId: body.challengeId,
    assertion: body.assertion,
    origin,
  });
  if (!result.ok) {
    return json({ error: result.error, code: result.code }, { status: 403 });
  }

  const meta = auditMeta(c);
  recordAudit([
    {
      event: "grant_create",
      phygitalToken: owner.phygitalToken,
      ok: true,
      actor: "owner_device",
      credentialId: owner.session.credentialId,
      intentHash: result.intentHash,
      detail: { grantId: result.grantId, ttlSeconds: body.ttlSeconds ?? null },
      ...meta,
    },
    {
      // createGrant resolves the open soft-deny inbox row inside the DO.
      event: "pending_approval",
      phygitalToken: owner.phygitalToken,
      actor: "owner_device",
      credentialId: owner.session.credentialId,
      intentHash: result.intentHash,
      detail: { resolution: "granted" },
      ...meta,
    },
  ]);

  return json({
    grantId: result.grantId,
    intentHash: result.intentHash,
    expiresAt: result.expiresAt,
  });
});

policyRoutes.get("/policies/:phygitalToken/approvals", async (c) => {
  const owner = await requireOwnerSession(c);
  if (owner instanceof Response) {
    if (owner.status === 401 || owner.status === 403) {
      return json({ approvals: [] });
    }
    return owner;
  }

  const { approvals } = await owner.stub.listOpenApprovals();
  return json({ approvals });
});

/** Owner declines a soft-deny request (session + isOwner; no WebAuthn). */
policyRoutes.post("/policies/:phygitalToken/approvals/deny", async (c) => {
  const owner = await requireOwnerSession(c);
  if (owner instanceof Response) return owner;

  const body = (await c.req.json().catch(() => ({}))) as {
    intentHash?: string;
  };
  const intentHash = body.intentHash?.trim();
  if (!intentHash) {
    return json(
      { error: "intentHash required", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  await owner.stub.resolvePendingApproval({
    intentHash,
    resolution: "denied",
  });
  recordAudit({
    event: "pending_approval",
    phygitalToken: owner.phygitalToken,
    actor: "owner_device",
    credentialId: owner.session.credentialId,
    intentHash,
    detail: { resolution: "denied" },
    ...auditMeta(c),
  });
  return json({ ok: true });
});
