import { describe, expect, it } from "vitest";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

import { getUsdcMint } from "@/lib/tokens/usdc-mint";
import {
  compilePolicySettings,
  defaultUsdcMintCap,
  derivePolicySettings,
  EMPTY_POLICY_SETTINGS,
  FIRST_ENABLE_POLICY_SETTINGS,
  hasStandingPolicyContent,
  PROTECTIONS_ON_SETTINGS,
} from "@/lib/wallet/policy-settings";

describe("policy-settings compile/derive", () => {
  it("FIRST_ENABLE matches SDK default raw caps", () => {
    expect(FIRST_ENABLE_POLICY_SETTINGS.mintLimits).toEqual([
      defaultUsdcMintCap(),
    ]);
    expect(FIRST_ENABLE_POLICY_SETTINGS.maxTransferSol).toBe("0.1");
    expect(hasStandingPolicyContent(EMPTY_POLICY_SETTINGS)).toBe(false);
    expect(hasStandingPolicyContent(PROTECTIONS_ON_SETTINGS)).toBe(true);
    expect(hasStandingPolicyContent(FIRST_ENABLE_POLICY_SETTINGS)).toBe(true);
  });

  it("protections-on keeps knobs without inventing caps", async () => {
    const next = await compilePolicySettings(PROTECTIONS_ON_SETTINGS);
    expect(next.version).toBe("3");
    expect(next.mintLimits).toBeUndefined();
    expect(next.maxSolLamports).toBeUndefined();
    const settings = await derivePolicySettings(next);
    expect(settings.programAllowlist).toBe(true);
    expect(settings.mintLimits).toEqual([]);
    expect(settings.extraPrograms).toEqual([]);
  });

  it("round-trips multiple mint caps and SOL", async () => {
    const other = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const next = await compilePolicySettings({
      ...EMPTY_POLICY_SETTINGS,
      mintLimits: [
        {
          mint: String(getUsdcMint()),
          maxUi: "25.00",
          decimals: 6,
          symbol: "USDC",
        },
        { mint: other, maxUi: "10", decimals: 6, symbol: "OTHER" },
      ],
      maxTransferSol: "0.0500",
      programAllowlist: true,
    });
    expect(next.mintLimits).toEqual([
      { mint: String(getUsdcMint()), maxRaw: "25000000" },
      { mint: other, maxRaw: "10000000" },
    ]);
    const settings = await derivePolicySettings(
      next,
      new Map([
        [String(getUsdcMint()), { decimals: 6, symbol: "USDC" }],
        [other, { decimals: 6, symbol: "OTHER" }],
      ])
    );
    expect(settings.mintLimits).toEqual([
      {
        mint: String(getUsdcMint()),
        maxUi: "25",
        decimals: 6,
        symbol: "USDC",
      },
      { mint: other, maxUi: "10", decimals: 6, symbol: "OTHER" },
    ]);
    expect(settings.maxTransferSol).toBe("0.05");
  });

  it("compiles exceptions without duplicating built-ins", async () => {
    const extra = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
    const next = await compilePolicySettings({
      ...EMPTY_POLICY_SETTINGS,
      programAllowlist: true,
      extraPrograms: [extra, String(TOKEN_PROGRAM_ADDRESS)],
    });
    expect(next.extraPrograms).toEqual([extra]);
    const settings = await derivePolicySettings(next);
    expect(settings.extraPrograms).toEqual([extra]);
  });

  it("protections-only compile has no spend caps", async () => {
    const next = await compilePolicySettings({
      ...EMPTY_POLICY_SETTINGS,
      programAllowlist: true,
    });
    expect(next).toEqual({ version: "3" });
    const settings = await derivePolicySettings(next);
    expect(settings.mintLimits).toEqual([]);
  });

  it("round-trips an allowed-origins allowlist, normalizing entries", async () => {
    const next = await compilePolicySettings({
      ...EMPTY_POLICY_SETTINGS,
      allowedOrigins: [
        "shop.example.com", // bare host → https://
        "https://shop.example.com", // duplicate after normalization
        "https://app.example.com/path",
        "  ", // blank dropped
      ],
    });
    expect(next.allowedOrigins).toEqual([
      "https://shop.example.com",
      "https://app.example.com",
    ]);
    // An allowlist alone is enough to persist a standing policy document.
    expect(
      hasStandingPolicyContent({
        ...EMPTY_POLICY_SETTINGS,
        allowedOrigins: ["https://shop.example.com"],
      })
    ).toBe(true);
    const settings = await derivePolicySettings(next);
    expect(settings.allowedOrigins).toEqual([
      "https://shop.example.com",
      "https://app.example.com",
    ]);
  });

  it("omits allowedOrigins when none are set", async () => {
    const next = await compilePolicySettings({
      ...EMPTY_POLICY_SETTINGS,
      programAllowlist: true,
    });
    expect(next.allowedOrigins).toBeUndefined();
  });
});
