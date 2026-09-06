/**
 * USD formatting helpers for wallet UI.
 *
 * Keep this lightweight and pure: no React, no data fetching.
 */

export function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  const abs = Math.abs(value);
  const maximumFractionDigits =
    abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 4;

  // Fixed locale avoids SSR/client hydration mismatches from `undefined`.
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits,
  }).format(value);
}

export function sumUsd(usdValues: Array<number | null | undefined>): number {
  let sum = 0;
  for (const v of usdValues) {
    if (typeof v === "number" && Number.isFinite(v)) sum += v;
  }
  return sum;
}

