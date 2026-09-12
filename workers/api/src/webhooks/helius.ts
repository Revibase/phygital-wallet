/**
 * POST /webhooks/helius — credit top-ups + debit default-verifier execute fees.
 */
import { Hono } from "hono";

import { processHeliusWebhookPayload } from "@/fees/helius-fee-tx";
import { json } from "@/shared/http";
import { getEnv } from "@/shared/request-context";

export const heliusWebhookRoutes = new Hono();

function authorized(req: Request): boolean {
  const secret = getEnv().HELIUS_WEBHOOK_AUTH?.trim();
  if (!secret) return false;
  const header =
    req.headers.get("Authorization")?.trim() ||
    req.headers.get("authorization")?.trim() ||
    "";
  if (header === secret) return true;
  if (header === `Bearer ${secret}`) return true;
  const custom = req.headers.get("X-Helius-Auth")?.trim();
  return custom === secret;
}

heliusWebhookRoutes.post("/webhooks/helius", async (c) => {
  if (!authorized(c.req.raw)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await processHeliusWebhookPayload(body);
    return json({ ok: true, ...result });
  } catch (error) {
    console.error("helius webhook failed", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Webhook processing failed",
      },
      { status: 500 }
    );
  }
});
