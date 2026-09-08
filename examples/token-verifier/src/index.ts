/**
 * Bare-minimum custom token-verifier.
 *
 * `getPhygitalWalletSigner` only requires:
 *   POST /preview  — policy check on body instructions (before NFC)
 *   POST /sign     — co-sign wrapped execute / config wire txs
 *
 * Point TokenVerifier.endpoint at this server's HTTPS origin
 * (no trailing slash, no /preview or /sign). Max 128 bytes.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { loadDotEnv } from "./env.js";
import { loadVerifierKey } from "./keys.js";
import { previewRoutes } from "./routes/preview.js";
import { signRoutes } from "./routes/sign.js";

loadDotEnv();

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/", (c) =>
  c.json({
    name: "token-verifier-example",
    endpoints: ["POST /preview", "POST /sign", "GET /health"],
  }),
);

app.get("/health", (c) => {
  const key = loadVerifierKey();
  return c.json({ ok: true, verifier: key.publicKey });
});

app.route("/", previewRoutes);
app.route("/", signRoutes);

const port = Number(process.env.PORT ?? "8787");
const key = loadVerifierKey();

console.log(`token-verifier listening on http://127.0.0.1:${port}`);
console.log(`verifier pubkey: ${key.publicKey}`);
console.log(
  "On-chain endpoint must be https://… (use a tunnel for local testing).",
);

serve({ fetch: app.fetch, port });
