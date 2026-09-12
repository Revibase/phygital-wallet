import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

import { getUsdcMint, USDC_DECIMALS } from "@/tokens/usdc-mint";

export const CLASSIC_TOKEN_PROGRAM = TOKEN_PROGRAM_ADDRESS;

const USDC_ICON_URL = "/tokens/usdc.png";

export type PaymentToken = {
  mint: string;
  symbol: string;
  name: string;
  icon: string | null;
  decimals: number;
  tokenProgram: string;
};

export function isClassicTokenProgram(
  program: string | null | undefined
): boolean {
  return (
    program === CLASSIC_TOKEN_PROGRAM ||
    program === String(CLASSIC_TOKEN_PROGRAM)
  );
}

export function defaultUsdcToken(): PaymentToken {
  return {
    mint: String(getUsdcMint()),
    symbol: "USDC",
    name: "USD Coin",
    icon: USDC_ICON_URL,
    decimals: USDC_DECIMALS,
    tokenProgram: String(CLASSIC_TOKEN_PROGRAM),
  };
}
