import { type Address } from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";

import { getUsdcMint } from "@/lib/tokens/usdc-mint";

export const USDC_ICON_URL = "/tokens/usdc.png";
export const SOL_ICON_URL = "/tokens/sol.png";

export const NATIVE_SOL_MINT =
  "So11111111111111111111111111111111111111112" as const;

/** App sentinel — not an on-chain program id. */
export const NATIVE_SOL_TOKEN_PROGRAM = "native" as const;

export const CLASSIC_TOKEN_PROGRAM = TOKEN_PROGRAM_ADDRESS;
export const TOKEN_2022_PROGRAM = TOKEN_2022_PROGRAM_ADDRESS;
export const ASSOCIATED_TOKEN_PROGRAM = ASSOCIATED_TOKEN_PROGRAM_ADDRESS;
export const SYSTEM_PROGRAM = SYSTEM_PROGRAM_ADDRESS;

export type PaymentToken = {
  mint: string;
  symbol: string;
  name: string;
  icon: string | null;
  decimals: number;
  tokenProgram: string;
};

export type PaymentTokenHolding = Omit<PaymentToken, "tokenProgram"> & {
  tokenProgram?: string;
  balanceRaw: string;
  balanceUi: string;
  /** USD price info from DAS / `token_info.price_info` (if available). */
  pricePerTokenUsd?: number | null;
  /** Total USD value for this holding (if available). */
  valueUsd?: number | null;
};

export function isDefaultMint(mint: string | Address): boolean {
  return String(mint) === String(getUsdcMint());
}

/** Prefer vendored SOL/USDC marks — remote Jupiter URLs often fail to paint. */
export function resolveTokenIconSrc(
  mint: string,
  icon: string | null | undefined
): string | null {
  if (mint === NATIVE_SOL_MINT) return SOL_ICON_URL;
  if (isDefaultMint(mint)) return USDC_ICON_URL;
  return icon?.trim() || null;
}

export function isNativeSolHolding(h: {
  mint: string;
  tokenProgram?: string;
}): boolean {
  return h.tokenProgram === NATIVE_SOL_TOKEN_PROGRAM;
}

export function isClassicTokenProgram(
  program: string | null | undefined
): boolean {
  return (
    program === CLASSIC_TOKEN_PROGRAM ||
    program === String(CLASSIC_TOKEN_PROGRAM)
  );
}

export function isToken2022Program(
  program: string | null | undefined
): boolean {
  return (
    program === TOKEN_2022_PROGRAM || program === String(TOKEN_2022_PROGRAM)
  );
}

export function isSupportedTokenProgram(
  program: string | null | undefined
): boolean {
  return isClassicTokenProgram(program) || isToken2022Program(program);
}

/** Resolve classic vs Token-2022; throws when DAS/API omitted the program. */
export function requireSupportedTokenProgram(
  program: string | null | undefined
): typeof CLASSIC_TOKEN_PROGRAM | typeof TOKEN_2022_PROGRAM {
  if (isToken2022Program(program)) return TOKEN_2022_PROGRAM;
  if (isClassicTokenProgram(program)) return CLASSIC_TOKEN_PROGRAM;
  throw new Error("Missing token program for this asset.");
}

export function nativeSolHolding(
  balanceRaw: bigint,
  balanceUi: string,
  pricePerTokenUsd?: number | null,
  valueUsd?: number | null
): PaymentTokenHolding {
  return {
    mint: NATIVE_SOL_MINT,
    symbol: "SOL",
    name: "Solana",
    icon: SOL_ICON_URL,
    decimals: 9,
    tokenProgram: NATIVE_SOL_TOKEN_PROGRAM,
    balanceRaw: balanceRaw.toString(),
    balanceUi,
    pricePerTokenUsd: pricePerTokenUsd ?? null,
    valueUsd: valueUsd ?? null,
  };
}
