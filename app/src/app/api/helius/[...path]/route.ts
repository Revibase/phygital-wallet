/**
 * Helius WaaS route handler — keeps `HELIUS_API_KEY` server-side.
 *
 * Backs the key-less `helius-wallet-kit` client: Turnkey bootstrap
 * (`/waas/config`), RPC proxy, Sender, priority fees, and tx history all route
 * through here. Requires the `HELIUS_API_KEY` server env var (never
 * `NEXT_PUBLIC_`).
 *
 * `getCloudflareContext()` only has a value inside a request, so it must be
 * called per-request — calling it at module scope throws during `next dev` /
 * `next build` (no request context yet).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createHeliusRouteHandler } from "helius-wallet-kit/next";

type RouteCtx = { params: Promise<{ path: string[] }> };

function handler() {
  return createHeliusRouteHandler({
    apiKey: getCloudflareContext().env.HELIUS_API_KEY,
  });
}

export function GET(req: Request, ctx: RouteCtx) {
  return handler().GET(req, ctx);
}

export function POST(req: Request, ctx: RouteCtx) {
  return handler().POST(req, ctx);
}
