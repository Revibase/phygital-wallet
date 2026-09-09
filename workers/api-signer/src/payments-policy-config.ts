/**
 * Validate standing policy JSON before SQLite upsert / on load.
 * Types live in `phygital-policy`; only the DO trusts this gate.
 */
import type {
  MintSpendLimit,
  PaymentsPolicyConfig,
} from "phygital-policy";

function isMintSpendLimit(value: unknown): value is MintSpendLimit {
  if (value == null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return typeof o.mint === "string" && typeof o.maxRaw === "string";
}

export function validatePaymentsPolicyConfig(
  raw: unknown,
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

  const config: PaymentsPolicyConfig = {
    version: "3",
    ...(mintLimits && mintLimits.length > 0 ? { mintLimits } : {}),
    ...(typeof obj.maxSolLamports === "string" && obj.maxSolLamports.length > 0
      ? { maxSolLamports: obj.maxSolLamports }
      : {}),
    ...(Array.isArray(obj.extraPrograms)
      ? {
          extraPrograms: obj.extraPrograms.filter(
            (v): v is string => typeof v === "string",
          ),
        }
      : {}),
  };

  return { ok: true, config };
}
