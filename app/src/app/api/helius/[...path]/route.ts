/**
 * Helius WaaS route handler — keeps `HELIUS_API_KEY` server-side.
 *
 * Backs the key-less `helius-wallet-kit` client: Turnkey bootstrap
 * (`/waas/config`), RPC proxy, Sender, priority fees, and tx history all route
 * through here. Requires the `HELIUS_API_KEY` server env var (never
 * `NEXT_PUBLIC_`).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createHeliusRouteHandler } from "helius-wallet-kit/next";

export const { GET, POST } = createHeliusRouteHandler({
  apiKey: getCloudflareContext().env.HELIUS_API_KEY,
});
