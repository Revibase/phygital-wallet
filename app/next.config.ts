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
    // Delegate WebAuthn + clipboard-write to the cross-origin secure-signer
    // iframe via Permissions-Policy, paired with the iframe `allow=` attribute.
    const signerOrigin =
      process.env.NEXT_PUBLIC_SECURE_SIGNER_ORIGIN?.trim() || "http://localhost:5173";
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none';",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Permissions-Policy",
            value: `publickey-credentials-get=(self "${signerOrigin}"), publickey-credentials-create=(self), clipboard-write=(self "${signerOrigin}")`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
