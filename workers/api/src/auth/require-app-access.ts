/**
 * Outer API floor: device session OR browse-unlock (except public allowlist).
 * Owner WebAuthn / tickets / isOwner remain on individual routes.
 */
import type { Context } from "hono";

import { readBrowseUnlock } from "@/auth/browse-unlock-session";
import { readDeviceSession } from "@/auth/device-session";
import { json } from "@/shared/http";

/** Exact method+path pairs that mint sessions or serve the public verifier. */
const PUBLIC_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: "GET", path: "/health" },
  { method: "POST", path: "/preview" },
  { method: "POST", path: "/sign" },
  { method: "GET", path: "/auth/device/register-options" },
  { method: "POST", path: "/auth/device" },
  { method: "GET", path: "/auth/device-session/options" },
  { method: "POST", path: "/auth/device-session" },
  { method: "GET", path: "/verify-tap" },
  { method: "POST", path: "/auth/browse-unlock" },
  { method: "POST", path: "/webhooks/helius" },
  // Soft-deny visitor / third-party: ticket auth on the route itself.
  { method: "GET", path: "/approvals/live" },
  { method: "GET", path: "/approvals/watch" },
  // Token landing before tap/Hold — must work with zero cookies.
  { method: "GET", path: "/auth/device/gate" },
];

export function normalizeApiPath(path: string): string {
  if (!path) return "/";
  const noQuery = path.split("?")[0] ?? path;
  if (noQuery.length > 1 && noQuery.endsWith("/")) {
    return noQuery.slice(0, -1);
  }
  return noQuery || "/";
}

/** Visitor cancel soft-deny: `POST /policies/:token/approvals/cancel` (watch ticket). */
function isApprovalsCancelPath(method: string, path: string): boolean {
  return (
    method.toUpperCase() === "POST" &&
    /^\/policies\/[^/]+\/approvals\/cancel$/.test(normalizeApiPath(path))
  );
}

export function isPublicApiPath(method: string, path: string): boolean {
  const m = method.toUpperCase();
  const p = normalizeApiPath(path);
  if (PUBLIC_ROUTES.some((r) => r.method === m && r.path === p)) return true;
  return isApprovalsCancelPath(m, p);
}

/**
 * Open CORS (no cookies): public verifier + soft-deny ticket surfaces for
 * third-party integrators. Path-based so OPTIONS preflight matches too.
 */
export function isOpenCorsPath(_method: string, path: string): boolean {
  const p = normalizeApiPath(path);
  if (p === "/preview" || p === "/sign") return true;
  if (p === "/approvals/live" || p === "/approvals/watch") return true;
  return /^\/policies\/[^/]+\/approvals\/cancel$/.test(p);
}

/** @deprecated Prefer {@link isOpenCorsPath} — kept for call-site clarity on verifier-only checks. */
export function isVerifierPublicPath(path: string): boolean {
  const p = normalizeApiPath(path);
  return p === "/preview" || p === "/sign";
}

/**
 * Token from query or known path shapes. Global middleware runs before route
 * params are bound, so we parse the pathname ourselves.
 */
export function extractPhygitalTokenFromRequest(
  path: string,
  queryToken: string | undefined,
): string | null {
  const q = queryToken?.trim();
  if (q) return q;

  const p = normalizeApiPath(path);

  const policies = /^\/policies\/([^/]+)/.exec(p);
  if (policies?.[1]) return decodeURIComponent(policies[1]);

  const links = /^\/auth\/device\/links\/([^/]+)/.exec(p);
  if (links?.[1] && links[1] !== "status") {
    return decodeURIComponent(links[1]);
  }

  return null;
}

export type AppAccessInput = {
  method: string;
  path: string;
  queryToken?: string;
  hasDeviceSession: boolean;
  browseToken: string | null;
};

/** Pure gate decision for tests and middleware. */
export function evaluateAppAccess(
  input: AppAccessInput,
): "allow" | "deny" | "deny_token_mismatch" {
  if (isPublicApiPath(input.method, input.path)) return "allow";
  if (input.hasDeviceSession) return "allow";
  if (!input.browseToken) return "deny";

  const token = extractPhygitalTokenFromRequest(
    input.path,
    input.queryToken,
  );
  if (token && input.browseToken !== token) return "deny_token_mismatch";
  return "allow";
}

/**
 * Returns a 401 Response when access is denied; otherwise null.
 */
export async function requireAppAccess(
  c: Context<{ Bindings: Env }>,
): Promise<Response | null> {
  const device = await readDeviceSession(c);
  const browse = await readBrowseUnlock(c);
  const decision = evaluateAppAccess({
    method: c.req.method,
    path: c.req.path,
    queryToken: c.req.query("phygitalToken"),
    hasDeviceSession: Boolean(device),
    browseToken: browse?.phygitalToken ?? null,
  });

  if (decision === "allow") return null;

  if (decision === "deny_token_mismatch") {
    return json(
      {
        error: "Unlock this item again to continue.",
        code: "session_required",
      },
      { status: 401 },
    );
  }

  return json(
    {
      error: "Sign in or unlock this item to continue.",
      code: "session_required",
    },
    { status: 401 },
  );
}
