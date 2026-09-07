/** Client fee estimate — keep in sync with api-signer `fees/constants.ts`. */
const FEE_BASE_LAMPORTS = 10_000;
const FEE_LAMPORTS_PER_IX = 5_000;
/** Starter / “low balance” floor (~0.001 SOL). */
export const FEE_BALANCE_LOW_LAMPORTS = 1_000_000;

function requiredFeeLamports(instructionCount: number): number {
  const n = Math.max(0, instructionCount);
  return FEE_BASE_LAMPORTS + FEE_LAMPORTS_PER_IX * n;
}

export function lamportsToSolUi(lamports: number | bigint): string {
  const n = Number(lamports);
  if (!Number.isFinite(n)) return "0";
  return (n / 1e9).toFixed(9).replace(/\.?0+$/, "") || "0";
}

/** Human fee display — cap at 6 decimals, round up so estimate never understates. */
export function formatNetworkFeeUi(lamports: number | bigint): string {
  const n = Number(lamports);
  if (!Number.isFinite(n) || n <= 0) return "0";
  const roundedUp = Math.ceil(n / 1_000) * 1_000; // nearest 0.000001 SOL
  const sol = roundedUp / 1e9;
  return sol.toFixed(6).replace(/\.?0+$/, "") || "0";
}

/** Estimate prepaid network fee for a send (before wrap / compute budget). */
export function estimateNetworkFeeLamports(
  kind: "native" | "fungible" | "nft" | "pnft" | "cnft" | "core",
): number {
  // Matches buildSendInstructions body ix counts in send-asset.ts.
  switch (kind) {
    case "native":
    case "cnft":
    case "core":
      return requiredFeeLamports(1);
    case "fungible":
    case "nft":
    case "pnft":
      return requiredFeeLamports(2); // create ATA idempotent + transfer
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
