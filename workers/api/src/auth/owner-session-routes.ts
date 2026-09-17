/**
 * Owner session + per-item owner browse.
 *
 * Session mint happens on PUT /owner-wallet/blob (same possession proof).
 *
 *   GET    /owner-session          → { publicKey, expiresAt } | null
 *   DELETE /owner-session          — clear owner_session (+ owner_browse)
 *   POST   /accessory/owner-browse { phygitalToken } — requires owner_session
 *   GET    /accessory/session      → { mode, phygitalToken }
 */
import { Hono } from "hono";
import {
  address,
  createSolanaRpc,
} from "@solana/kit";
import {
  fetchMaybeAuthority,
  findAuthorityAccountPda,
} from "phygital-wallet-sdk";

import { auditMeta, recordAudit } from "@/audit/audit-log";
import {
  clearBrowseUnlockCookie,
  readBrowseUnlock,
} from "@/auth/browse-unlock-session";
import {
  clearOwnerBrowseCookie,
  issueOwnerBrowseCookie,
  readOwnerBrowse,
} from "@/auth/owner-browse-session";
import {
  clearOwnerSessionCookie,
  readOwnerSession,
} from "@/auth/owner-session";
import { getErrorMessage } from "@/shared/errors";
import { json } from "@/shared/http";
import { tryParseAddress } from "@/shared/solana/address";
import { getRpcUrl } from "@/shared/solana/cluster";

export const ownerSessionRoutes = new Hono<{ Bindings: Env }>();

/** GET /owner-session — cookie is the login source of truth. */
ownerSessionRoutes.get("/owner-session", async (c) => {
  const session = await readOwnerSession(c);
  if (!session) {
    return json({ publicKey: null, expiresAt: null });
  }
  return json({
    publicKey: session.publicKey,
    expiresAt: session.exp,
  });
});

/** DELETE /owner-session — logout clears owner cookies. */
ownerSessionRoutes.delete("/owner-session", async (c) => {
  clearOwnerSessionCookie(c);
  clearOwnerBrowseCookie(c);
  return json({ ok: true });
});

/**
 * POST /accessory/owner-browse — quiet per-item admit.
 * Requires live owner_session; RPC-checks Authority == session pubkey.
 */
ownerSessionRoutes.post("/accessory/owner-browse", async (c) => {
  const session = await readOwnerSession(c);
  if (!session) {
    return json(
      {
        error: "Sign in on this phone to open accessories from Home.",
        code: "owner_session_required",
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const phygitalTokenRaw = (body as Record<string, unknown>)["phygitalToken"];
  if (
    typeof phygitalTokenRaw !== "string" ||
    !tryParseAddress(phygitalTokenRaw)
  ) {
    return json(
      {
        error: "phygitalToken must be a valid Solana address",
        code: "invalid_phygital_token",
      },
      { status: 400 },
    );
  }
  const phygitalToken = phygitalTokenRaw.trim();

  const existing = await readOwnerBrowse(c);
  if (existing?.phygitalToken === phygitalToken) {
    clearBrowseUnlockCookie(c);
    return json({
      ok: true,
      mode: "owner" as const,
      phygitalToken,
      expiresAt: existing.exp,
    });
  }

  try {
    const rpc = createSolanaRpc(getRpcUrl());
    const [authorityPda] = await findAuthorityAccountPda({
      phygitalToken: address(phygitalToken),
    });
    const account = await fetchMaybeAuthority(rpc, authorityPda);
    if (!account.exists) {
      return json(
        {
          error: "This accessory has not been claimed yet.",
          code: "not_claimed",
        },
        { status: 403 },
      );
    }
    const onChainAuthority = String(account.data.header.authority);
    if (onChainAuthority !== session.publicKey) {
      return json(
        {
          error: "You are not the owner of this accessory.",
          code: "not_authority",
        },
        { status: 403 },
      );
    }
  } catch (err) {
    return json(
      {
        error: getErrorMessage(err, "Could not verify ownership"),
        code: "authority_lookup_failed",
      },
      { status: 502 },
    );
  }

  // Owner browse wins over leftover accessory cookie for this admit.
  clearBrowseUnlockCookie(c);
  const { expiresAt } = await issueOwnerBrowseCookie(c, phygitalToken);
  const meta = auditMeta(c);
  recordAudit({
    event: "owner_browse",
    phygitalToken,
    ok: true,
    actor: "owner",
    origin: meta.origin,
    requestId: meta.requestId,
  });
  return json({
    ok: true,
    mode: "owner" as const,
    phygitalToken,
    expiresAt,
  });
});

/**
 * GET /accessory/session — which admit cookie is live.
 * Physical tap (browse_unlock) wins when both somehow remain.
 */
ownerSessionRoutes.get("/accessory/session", async (c) => {
  const browse = await readBrowseUnlock(c);
  if (browse) {
    return json({
      mode: "accessory" as const,
      phygitalToken: browse.phygitalToken,
      expiresAt: browse.exp,
    });
  }
  const ownerBrowse = await readOwnerBrowse(c);
  if (ownerBrowse) {
    return json({
      mode: "owner" as const,
      phygitalToken: ownerBrowse.phygitalToken,
      expiresAt: ownerBrowse.exp,
    });
  }
  return json({ mode: null, phygitalToken: null });
});
