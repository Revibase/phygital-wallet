import { errorCopy } from "@/lib/copy/phygital";

/** Parse / format token amounts without program deps. */

export function formatTokenAmount(raw: bigint, decimals: number): string {
  if (raw === BigInt(0)) return "0";
  const negative = raw < BigInt(0);
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  const formatted = frac.length > 0 ? `${whole}.${frac}` : whole.toString();
  return negative ? `-${formatted}` : formatted;
}

/** Shorten a formatted UI amount for hero display (lists keep full precision). */
export function formatCompactTokenAmount(uiAmount: string): string {
  const value = Number(uiAmount);
  if (!Number.isFinite(value)) return uiAmount;
  const abs = Math.abs(value);
  const maximumFractionDigits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

/** Keep a single decimal point while stripping non-numeric characters. */
export function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  return `${cleaned.slice(0, dot + 1)}${cleaned
    .slice(dot + 1)
    .replace(/\./g, "")}`;
}

export function uiAmountToRaw(uiAmount: string, decimals: number): bigint {
  const trimmed = uiAmount.trim();
  if (!trimmed || Number(trimmed) <= 0 || trimmed.split(".").length > 2) {
    throw new Error(errorCopy.enterAmount.body);
  }
  const [whole = "0", frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimals`);
  }
  const padded = frac.padEnd(decimals, "0");
  const wholePart = BigInt(whole.replace(/^0+(?=\d)/, "") || "0");
  const fracPart = BigInt(padded || "0");
  return wholePart * 10n ** BigInt(decimals) + fracPart;
}
