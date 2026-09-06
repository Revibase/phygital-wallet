import { describe, expect, it } from "vitest";
import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

import { getUsdcMint } from "@/lib/tokens/usdc-mint";
import { CLASSIC_TOKEN_PROGRAM } from "@/lib/tokens/payment-token";
import {
  compilePolicySettings,
  derivePolicySettings,
  FIRST_ENABLE_POLICY_SETTINGS,
  hasStandingPolicyContent,
} from "@/lib/wallet/policy-settings";

const OWNER_A = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

describe("policy-settings compile/derive", () => {
  it("FIRST_ENABLE matches SDK default raw caps", () => {
    expect(FIRST_ENABLE_POLICY_SETTINGS.maxTransferUsdc).toBe("50");
    expect(FIRST_ENABLE_POLICY_SETTINGS.maxTransferSol).toBe("0.1");
    expect(
      hasStandingPolicyContent({
        maxTransferUsdc: null,
        maxTransferSol: null,
        recipientMode: "anyone",
        recipientAllowlist: [],
        extraPrograms: [],
      }),
    ).toBe(false);
    expect(
      hasStandingPolicyContent({
        ...FIRST_ENABLE_POLICY_SETTINGS,
      }),
    ).toBe(true);
  });

  it("round-trips caps and keeps default programs", async () => {
    const next = await compilePolicySettings({
      maxTransferUsdc: "25.00",
      maxTransferSol: "0.0500",
      recipientMode: "anyone",
      recipientAllowlist: [],
      extraPrograms: [],
    });
    const settings = await derivePolicySettings(next);
    expect(settings.maxTransferUsdc).toBe("25.00");
    expect(settings.maxTransferSol).toBe("0.0500");
    expect(settings.extraPrograms).toEqual([]);
    expect(
      next.programs.some((p) => p.programId === String(CLASSIC_TOKEN_PROGRAM)),
    ).toBe(true);
    expect(
      next.programs.some(
        (p) => p.programId === "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
      ),
    ).toBe(true);
  });

  it("derives recipient allowlist (collapses ATAs)", async () => {
    const next = await compilePolicySettings({
      maxTransferUsdc: "50.00",
      maxTransferSol: "0.1000",
      recipientMode: "allowlist",
      recipientAllowlist: [OWNER_A],
      extraPrograms: [],
    });
    const settings = await derivePolicySettings(next);
    expect(settings.recipientMode).toBe("allowlist");
    expect(settings.recipientAllowlist).toEqual([OWNER_A]);
    expect(next.programs.every((p) => !p.denies?.length)).toBe(true);

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

  it("compiles extraPrograms as allowAll without stripping defaults", async () => {
    const extra = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
    const next = await compilePolicySettings({
      maxTransferUsdc: "50.00",
      maxTransferSol: "0.1000",
      recipientMode: "anyone",
      recipientAllowlist: [],
      extraPrograms: [extra, String(CLASSIC_TOKEN_PROGRAM)],
    });
    expect(next.programs.find((p) => p.programId === extra)).toEqual({
      programId: extra,
      allowAll: true,
    });
    const token = next.programs.find(
      (p) => p.programId === String(CLASSIC_TOKEN_PROGRAM),
    );
    expect(token?.allowAll).toBeUndefined();
    const settings = await derivePolicySettings(next);
    expect(settings.extraPrograms).toEqual([extra]);
  });

  it("recipients-only compile has no spend aggregates", async () => {
    const next = await compilePolicySettings({
      maxTransferUsdc: null,
      maxTransferSol: null,
      recipientMode: "allowlist",
      recipientAllowlist: [OWNER_A],
      extraPrograms: [],
    });
    expect(next.transaction?.aggregates).toBeUndefined();
    const settings = await derivePolicySettings(next);
    expect(settings.maxTransferUsdc).toBeNull();
    expect(settings.maxTransferSol).toBeNull();
    expect(settings.recipientMode).toBe("allowlist");
    expect(settings.recipientAllowlist).toEqual([OWNER_A]);
  });

  it("apps-only compile has allowAll extra and no aggregates", async () => {
    const extra = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
    const next = await compilePolicySettings({
      maxTransferUsdc: null,
      maxTransferSol: null,
      recipientMode: "anyone",
      recipientAllowlist: [],
      extraPrograms: [extra],
    });
    expect(next.transaction?.aggregates).toBeUndefined();
    expect(next.programs.find((p) => p.programId === extra)).toEqual({
      programId: extra,
      allowAll: true,
    });
    const settings = await derivePolicySettings(next);
    expect(settings.maxTransferUsdc).toBeNull();
    expect(settings.extraPrograms).toEqual([extra]);
  });
});
