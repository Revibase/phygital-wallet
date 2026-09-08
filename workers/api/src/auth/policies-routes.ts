import { Hono, type Context } from "hono";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { PolicyDocument } from "phygital-verifier-sdk";

import { requireDeviceSession } from "@/auth/device-session";
import {
  approvalsLiveTicketHead,
  parseApprovalsLiveTicketHead,
} from "@/auth/approvals-tickets";
import { parseMutationBinding } from "@/auth/mutation-binding";
import { denyIfRateLimited } from "@/auth/rate-limit";
import {
  mintSignedSessionToken,
  parseSignedSessionToken,
} from "@/auth/session-hmac";
import { json } from "@/shared/http";
import { createLogger } from "@/shared/log";
import { tokenSigner, type TokenSignerRpc } from "@/verifier/token-signer";

export const policyRoutes = new Hono<{ Bindings: Env }>();

const APPROVALS_LIVE_TICKET_TTL_MS = 60_000;

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
    policy?: PolicyDocument;
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
    policy: body.policy,
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
    return json(
      { error: result.error, code: result.code },
      { status: 403 },
    );
  }
  // Inbox cleared inside DO clearPolicyAndGrants.
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
    return json(
      { error: result.error, code: result.code },
      { status: 403 },
    );
  }

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
  return json({ ok: true });
});

/** Visitor withdraws a soft-deny (watch ticket must match intent). */
policyRoutes.post("/policies/:phygitalToken/approvals/cancel", async (c) => {
  const limited = await denyIfRateLimited(c, "approvals-cancel", {
    maxHits: 60,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const phygitalToken = c.req.param("phygitalToken")?.trim();
  if (!phygitalToken) {
    return json(
      { error: "Missing phygitalToken", code: "invalid_transaction" },
      { status: 400 },
    );
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    intentHash?: string;
    watchTicket?: string;
  };
  const intentHash = body.intentHash?.trim();
  const watchTicket = body.watchTicket?.trim();
  if (!intentHash || !watchTicket) {
    return json(
      {
        error: "intentHash and watchTicket required",
        code: "invalid_transaction",
      },
      { status: 400 },
    );
  }

  const parsed = await parseSignedSessionToken(watchTicket);
  const live = parsed ? parseApprovalsLiveTicketHead(parsed.head) : null;
  if (
    !live ||
    live.kind !== "watch" ||
    live.phygitalToken !== phygitalToken ||
    live.intentHash !== intentHash
  ) {
    return json(
      { error: "Invalid watch ticket", code: "invalid_transaction" },
      { status: 403 },
    );
  }

  await tokenSigner(c.env, phygitalToken).resolvePendingApproval({
    intentHash,
    resolution: "cancelled",
  });
  return json({ ok: true });
});

policyRoutes.post("/policies/:phygitalToken/approvals/live-ticket", async (c) => {
  const limited = await denyIfRateLimited(c, "approvals-live-ticket", {
    maxHits: 60,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const owner = await requireOwnerSession(c);
  if (owner instanceof Response) return owner;

  const { token, expiresAt } = await mintSignedSessionToken(
    approvalsLiveTicketHead(owner.phygitalToken, owner.session.credentialId),
    APPROVALS_LIVE_TICKET_TTL_MS,
  );
  createLogger("api", c.env).debug("approvals.live_ticket", {
    phygitalToken: owner.phygitalToken,
  });
  return json({ ticket: token, expiresAt });
});

/**
 * Visitor catch-up after a WS blip — same watch ticket as `/approvals/live`.
 * One-shot; not a poll loop.
 */
policyRoutes.get("/approvals/watch", async (c) => {
  const limited = await denyIfRateLimited(c, "approvals-watch-status", {
    maxHits: 120,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const ticket = c.req.query("ticket")?.trim();
  const parsed = await parseSignedSessionToken(ticket);
  if (!parsed) {
    return json(
      { error: "Watch ticket required", code: "device_session_required" },
      { status: 401 },
    );
  }

  const live = parseApprovalsLiveTicketHead(parsed.head);
  if (!live || live.kind !== "watch") {
    return json({ error: "Invalid watch ticket", code: "invalid_transaction" }, {
      status: 403,
    });
  }

  const status = await tokenSigner(c.env, live.phygitalToken).getApprovalWatchStatus({
    intentHash: live.intentHash,
  });
  createLogger("api", c.env).debug("approvals.watch_status", {
    phygitalToken: live.phygitalToken,
    status: status.status,
  });
  return json(status);
});

/** Hibernatable WS: owner inbox or visitor watch (ticket embeds phygitalToken). */
policyRoutes.get("/approvals/live", async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return json({ error: "Expected WebSocket", code: "upgrade_required" }, {
      status: 426,
    });
  }

  const limited = await denyIfRateLimited(c, "approvals-live-ws", {
    maxHits: 90,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const ticket = c.req.query("ticket")?.trim();
  const parsed = await parseSignedSessionToken(ticket);
  if (!parsed) {
    return json(
      { error: "Live ticket required", code: "device_session_required" },
      { status: 401 },
    );
  }

  const live = parseApprovalsLiveTicketHead(parsed.head);
  if (!live) {
    return json({ error: "Invalid live ticket", code: "not_owner" }, {
      status: 403,
    });
  }

  const watchIntent =
    live.kind === "watch" ? live.intentHash : undefined;

  createLogger("api", c.env).debug("approvals.live_accept", {
    kind: live.kind,
    phygitalToken: live.phygitalToken,
  });

  const headers = new Headers(c.req.raw.headers);
  if (watchIntent) {
    headers.set("X-Revibase-Watch-Intent", watchIntent);
  }
  return c.env.TOKEN_SIGNER.getByName(live.phygitalToken).fetch(
    new Request(c.req.raw, { headers }),
  );
});
