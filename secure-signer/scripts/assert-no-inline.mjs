// Build-time guard: fail if the produced HTML contains any inline <script> or
// inline event handler. The signer ships under `script-src 'self'` with no
// 'unsafe-inline'; an inline script would silently break at runtime (or, worse,
// force a CSP relaxation). Keeping this in the build makes a regression loud.
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: assert-no-inline.mjs <html-file>");
  process.exit(2);
}

const html = readFileSync(file, "utf8");

const problems = [];

// Inline <script> = a <script> tag without a src attribute that has a body.
const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = scriptTag.exec(html)) !== null) {
  const attrs = m[1] ?? "";
  const body = (m[2] ?? "").trim();
  const hasSrc = /\bsrc\s*=/.test(attrs);
  if (!hasSrc && body.length > 0) {
    problems.push(`inline <script> body: ${body.slice(0, 80)}...`);
  }
}

// Inline event handlers (onclick=, onload=, ...).
if (/<[^>]*\son[a-z]+\s*=/i.test(html)) {
  problems.push("inline on* event handler attribute");
}

// javascript: URLs.
if (/=["']?\s*javascript:/i.test(html)) {
  problems.push("javascript: URL");
}

if (problems.length > 0) {
  console.error(`CSP guard failed for ${file}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`CSP guard passed: ${file} has no inline scripts/handlers.`);
