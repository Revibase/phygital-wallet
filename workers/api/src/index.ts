/**
 * Revibase API Worker entry.
 *
 * Code map → `api/README.md`
 * Domains → `tokens/`, `auth/`, `verifier/`, `shared/`
 */
import { Hono } from "hono";

import { deviceAuthRoutes } from "@/auth/device-routes";
import { policyRoutes } from "@/auth/policies-routes";
import { requireAppAccess } from "@/auth/require-app-access";
import { appCors } from "@/shared/cors";
import { createLogger } from "@/shared/log";
import { runWithRequestStore } from "@/shared/request-context";
import { tokenRoutes } from "@/tokens/routes";
import { verifierRoutes } from "@/verifier";
import { heliusWebhookRoutes } from "@/webhooks/helius";

const app = new Hono<{ Bindings: Env }>();

app.use("*", appCors);

app.use("*", async (c, next) => {
  await runWithRequestStore(
    {
      env: c.env,
      waitUntil: (promise) => c.executionCtx.waitUntil(promise),
    },
    () => next(),
  );
});

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const denied = await requireAppAccess(c);
  if (denied) return denied;
  return next();
});

app.use("*", async (c, next) => {
  const log = createLogger("api", c.env);
  const started = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const requestId =
    c.req.header("cf-ray") ?? c.req.header("x-request-id") ?? undefined;
  const skipSummary = path === "/health";

  log.debug("request.start", { method, path, requestId });
  try {
    await next();
  } catch (err) {
    log.error("request.exception", {
      method,
      path,
      requestId,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (skipSummary) return;

  const status = c.res.status;
  const fields = {
    method,
    path,
    status,
    requestId,
    ms: Date.now() - started,
  };
  if (status >= 500) log.error("request.end", fields);
  else if (status >= 400) log.warn("request.end", fields);
  else log.info("request.end", fields);
});

app.get("/health", (c) => c.json({ ok: true }));

app.route("/", tokenRoutes);
app.route("/", verifierRoutes);
app.route("/", policyRoutes);
app.route("/", deviceAuthRoutes);
app.route("/", heliusWebhookRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
