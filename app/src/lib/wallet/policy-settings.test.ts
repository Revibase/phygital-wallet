import { describe, expect, it } from "vitest";
import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

import { getUsdcMint } from "@/lib/tokens/usdc-mint";
import { CLASSIC_TOKEN_PROGRAM } from "@/lib/tokens/payment-token";
import {
  compilePolicySettings,
  derivePolicySettings,
  EMPTY_POLICY_SETTINGS,
  FIRST_ENABLE_POLICY_SETTINGS,
  hasStandingPolicyContent,
  PROTECTIONS_ON_SETTINGS,
} from "@/lib/wallet/policy-settings";

const OWNER_A = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

describe("policy-settings compile/derive", () => {
  it("FIRST_ENABLE matches SDK default raw caps", () => {
    expect(FIRST_ENABLE_POLICY_SETTINGS.maxTransferUsdc).toBe("50");
    expect(FIRST_ENABLE_POLICY_SETTINGS.maxTransferSol).toBe("0.1");
    expect(hasStandingPolicyContent(EMPTY_POLICY_SETTINGS)).toBe(false);
    expect(hasStandingPolicyContent(PROTECTIONS_ON_SETTINGS)).toBe(true);
    expect(hasStandingPolicyContent(FIRST_ENABLE_POLICY_SETTINGS)).toBe(true);
  });

  it("protections-on keeps built-in programs without inventing caps", async () => {
    const next = await compilePolicySettings(PROTECTIONS_ON_SETTINGS);
    expect(next.transaction?.aggregates).toBeUndefined();
    expect(
      next.programs.some((p) => p.programId === String(CLASSIC_TOKEN_PROGRAM)),
    ).toBe(true);
    const settings = await derivePolicySettings(next);
    expect(settings.programAllowlist).toBe(true);
    expect(settings.includeStandardPrograms).toBe(true);
    expect(settings.maxTransferUsdc).toBeNull();
    expect(settings.extraPrograms).toEqual([]);
  });

  it("round-trips caps and keeps default programs", async () => {
    const next = await compilePolicySettings({
      ...EMPTY_POLICY_SETTINGS,
      maxTransferUsdc: "25.00",
      maxTransferSol: "0.0500",
      programAllowlist: true,
      includeStandardPrograms: true,
    });
    const settings = await derivePolicySettings(next);
    expect(settings.maxTransferUsdc).toBe("25.00");
    expect(settings.maxTransferSol).toBe("0.0500");
    expect(settings.extraPrograms).toEqual([]);
    expect(settings.includeStandardPrograms).toBe(true);
  });

  it("derives recipient allowlist (collapses ATAs)", async () => {
    const next = await compilePolicySettings({
      ...EMPTY_POLICY_SETTINGS,
      maxTransferUsdc: "50.00",
      maxTransferSol: "0.1000",
      recipientMode: "allowlist",
      recipientAllowlist: [OWNER_A],
      programAllowlist: true,
      includeStandardPrograms: true,
    });
    const settings = await derivePolicySettings(next);
    expect(settings.recipientMode).toBe("allowlist");
    expect(settings.recipientAllowlist).toEqual([OWNER_A]);

    const [[ata]] = await Promise.all([
      findAssociatedTokenPda({
        mint: getUsdcMint(),
        owner: address(OWNER_A),
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
    ]);
    const token = next.programs.find(
      (p) => p.programId === String(CLASSIC_TOKEN_PROGRAM),
    );
    expect(JSON.stringify(token?.allows)).toContain(String(ata));
  });

  it("compiles exceptions as allowAll without stripping defaults", async () => {
    const extra = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
    const next = await compilePolicySettings({
      ...EMPTY_POLICY_SETTINGS,
      programAllowlist: true,
      includeStandardPrograms: true,
      extraPrograms: [extra, String(CLASSIC_TOKEN_PROGRAM)],
    });
    expect(next.programs.find((p) => p.programId === extra)).toEqual({
      programId: extra,
      allowAll: true,
    });
    const settings = await derivePolicySettings(next);
    expect(settings.extraPrograms).toEqual([extra]);
    expect(settings.includeStandardPrograms).toBe(true);
  });

  it("recipients-only compile has no spend aggregates", async () => {
    const next = await compilePolicySettings({
      ...EMPTY_POLICY_SETTINGS,
      recipientMode: "allowlist",
      recipientAllowlist: [OWNER_A],
      programAllowlist: true,
      includeStandardPrograms: true,
    });
    expect(next.transaction?.aggregates).toBeUndefined();
    const settings = await derivePolicySettings(next);
    expect(settings.maxTransferUsdc).toBeNull();
    expect(settings.recipientMode).toBe("allowlist");
  });
});
