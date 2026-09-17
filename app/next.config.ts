import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

/**
 * Single local env source: Wrangler `.dev.vars` → `process.env`.
 * Next only auto-loads `.env*`; OpenNext/Wrangler only load `.dev.vars` into
 * Cloudflare `env`. This bridges them so `next dev` / `next build` match.
 * Values here overwrite any `.env*` Next already loaded.
 */
function loadDevVarsIntoProcessEnv() {
  const filePath = path.join(__dirname, ".dev.vars");
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDevVarsIntoProcessEnv();

/** pnpm hoists `next` to the workspace root — Turbopack must resolve from there. */
const workspaceRoot = path.join(__dirname, "..");

/** Production secure-signer — must match `app/wrangler.jsonc`. */
const PRODUCTION_SIGNER_ORIGIN = "https://signer.revibase.com";

function resolveSignerOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SECURE_SIGNER_ORIGIN?.trim() ||
    PRODUCTION_SIGNER_ORIGIN
  );
}

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ["phygital-wallet-sdk"],
  experimental: {
    optimizePackageImports: ["phygital-wallet-sdk"],
  },
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  async headers() {
    // Build-time headers: default to production signer so a CI/local build
    // without env does not ship `frame-src http://localhost:5173`. Local
    // `.dev.vars` still overrides via loadDevVarsIntoProcessEnv.
    const signerOrigin = resolveSignerOrigin();
    const localDev = isLocalOrigin(signerOrigin);

    const connectSrc = localDev
      ? "'self' https: http://localhost:* ws://localhost:* wss:"
      : "'self' https: wss:";

    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      `frame-src 'self' ${signerOrigin}`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            // Delegate WebAuthn get + clipboard-write to the secure-signer iframe.
            key: "Permissions-Policy",
            value: `publickey-credentials-get=(self "${signerOrigin}"), publickey-credentials-create=(self), clipboard-write=(self "${signerOrigin}")`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
