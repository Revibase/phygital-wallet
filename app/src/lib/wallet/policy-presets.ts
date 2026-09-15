import { uiAmountToRaw } from "@/lib/tokens/amount";
import { getUsdcMint, USDC_DECIMALS } from "@/lib/tokens/usdc-mint";
import { SOL_DECIMALS } from "@/lib/wallet/policy-format";
import type { MintCapInput, SolCapInput } from "@/lib/wallet/set-wallet-policy";

/** Weekly window — matches the editor default. */
export const POLICY_PRESET_WINDOW = 604_800n;

export type PolicyPresetId = "sol" | "usdc" | "sol_usdc";

export type PolicyPreset = {
  id: PolicyPresetId;
  /** Short chip / row title. */
  title: string;
  /** One-line outcome. */
  detail: string;
  solCap: SolCapInput | null;
  mintCaps: MintCapInput[];
};

/** Owner-facing quick setups for limiting accessory spend. */
export function policyPresets(): PolicyPreset[] {
  const usdc = String(getUsdcMint());
  const week = POLICY_PRESET_WINDOW;
  return [
    {
      id: "sol",
      title: "0.5 SOL / week",
      detail: "Only SOL and wrapped SOL. Other tokens blocked.",
      solCap: {
        cap: uiAmountToRaw("0.5", SOL_DECIMALS),
        windowSeconds: week,
      },
      mintCaps: [],
    },
    {
      id: "usdc",
      title: "50 USDC / week",
      detail: "Only USDC. SOL and other tokens blocked.",
      solCap: null,
      mintCaps: [
        {
          mint: usdc,
          cap: uiAmountToRaw("50", USDC_DECIMALS),
          windowSeconds: week,
        },
      ],
    },
    {
      id: "sol_usdc",
      title: "0.5 SOL + 50 USDC / week",
      detail: "SOL and USDC only. Everything else blocked.",
      solCap: {
        cap: uiAmountToRaw("0.5", SOL_DECIMALS),
        windowSeconds: week,
      },
      mintCaps: [
        {
          mint: usdc,
          cap: uiAmountToRaw("50", USDC_DECIMALS),
          windowSeconds: week,
        },
      ],
    },
  ];
}
