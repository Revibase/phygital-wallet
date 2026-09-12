/**
 * Validate standing policy JSON before SQLite upsert / on load.
 * Types live in `phygital-policy`; only the DO trusts this gate.
 */
import type { MintSpendLimit, PaymentsPolicyConfig } from "phygital-policy";
import { normalizeOrigin } from "phygital-verifier-sdk";

function isMintSpendLimit(value: unknown): value is MintSpendLimit {
  if (value == null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return typeof o.mint === "string" && typeof o.maxRaw === "string";
}

/**
 * Normalize an allowlist of website origins to canonical origins
 * (`https://example.com`) using the SAME `normalizeOrigin` the session bearer
 * uses at connect — so the stored allowlist can never drift from the bearer
 * origin it is later compared against. Non-string / unparseable entries are
 * dropped and the result is deduped; order-insensitive input → sorted output.
 */
function normalizeAllowedOrigins(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const canonical = normalizeOrigin(value);
    if (canonical) seen.add(canonical);
  }
  return [...seen].sort();
}

export function validatePaymentsPolicyConfig(
  raw: unknown
):
  | { ok: true; config: PaymentsPolicyConfig }
  | { ok: false; code: string; message: string } {
  if (raw == null || typeof raw !== "object") {
    return {
      ok: false,
      code: "invalid_policy",
      message: "Policy config must be an object",
    };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== "3") {
    return {
      ok: false,
      code: "invalid_policy",
      message: `Unsupported policy version: ${String(obj.version)}`,
    };
  }

  let mintLimits: MintSpendLimit[] | undefined;
  if (obj.mintLimits !== undefined) {
    if (!Array.isArray(obj.mintLimits)) {
      return {
        ok: false,
        code: "invalid_policy",
        message: "mintLimits must be an array",
      };
    }
    mintLimits = [];
    for (const entry of obj.mintLimits) {
      if (!isMintSpendLimit(entry)) {
        return {
          ok: false,
          code: "invalid_policy",
          message: "mintLimits entries must be { mint, maxRaw } strings",
        };
      }
      mintLimits.push({ mint: entry.mint.trim(), maxRaw: entry.maxRaw });
    }
  }

  let allowedOrigins: string[] | undefined;
  if (obj.allowedOrigins !== undefined) {
    if (!Array.isArray(obj.allowedOrigins)) {
      return {
        ok: false,
        code: "invalid_policy",
        message: "allowedOrigins must be an array",
      };
    }
    allowedOrigins = normalizeAllowedOrigins(obj.allowedOrigins);
  }

  const config: PaymentsPolicyConfig = {
    version: "3",
    ...(mintLimits && mintLimits.length > 0 ? { mintLimits } : {}),
    ...(typeof obj.maxSolLamports === "string" && obj.maxSolLamports.length > 0
      ? { maxSolLamports: obj.maxSolLamports }
      : {}),
    ...(Array.isArray(obj.extraPrograms)
      ? {
          extraPrograms: obj.extraPrograms.filter(
            (v): v is string => typeof v === "string"
          ),
        }
      : {}),
    ...(allowedOrigins && allowedOrigins.length > 0 ? { allowedOrigins } : {}),
  };

  return { ok: true, config };
}
