import { describe, expect, it } from "vitest";
import { PhygitalWalletInstruction } from "phygital-wallet-sdk";
import {
  classifySignRisk,
  instructionLabel,
  isCriticalInstruction,
  isElevatedInstruction,
  riskCallout,
} from "./sign-risk.js";
import type { TransactionSummary } from "./policy.js";

function summary(
  kinds: PhygitalWalletInstruction[],
  opts?: { innerTitles?: string[] },
): TransactionSummary {
  return {
    walletAddress: "Wallet111111111111111111111111111111111",
    instructions: kinds.map((kind) => ({
      kind,
      authority: null,
      phygitalToken: null,
      inner:
        opts?.innerTitles != null
          ? opts.innerTitles.map((title) => ({
              programAddress: "11111111111111111111111111111111",
              accounts: ["from", "to"],
              dataLength: 12,
              title,
              details: [],
            }))
          : kind === PhygitalWalletInstruction.ExecuteWithAuthority ||
              kind ===
                PhygitalWalletInstruction.ExecuteWithAuthorityUsingPolicies
            ? []
            : null,
      details: [],
    })),
    config: {},
  };
}

describe("sign-risk", () => {
  it("uses short owner-spend labels", () => {
    expect(
      instructionLabel(PhygitalWalletInstruction.ExecuteWithAuthority),
    ).toBe("Owner spend");
    expect(
      instructionLabel(PhygitalWalletInstruction.ClearAuthority),
    ).toBe("Remove owner");
  });

  it("treats clear-authority and clear-policy as critical", () => {
    expect(
      isCriticalInstruction(PhygitalWalletInstruction.ExecuteWithAuthority),
    ).toBe(false);
    expect(
      isCriticalInstruction(PhygitalWalletInstruction.ClearAuthority),
    ).toBe(true);
    expect(
      isCriticalInstruction(PhygitalWalletInstruction.ClearWalletPolicy),
    ).toBe(true);
    expect(
      isElevatedInstruction(PhygitalWalletInstruction.SetWalletPolicy),
    ).toBe(true);
    expect(classifySignRisk(summary([PhygitalWalletInstruction.Execute]))).toBe(
      "normal",
    );
    expect(
      classifySignRisk(
        summary([PhygitalWalletInstruction.ExecuteWithAuthority], {
          innerTitles: ["Send 0.1 SOL"],
        }),
      ),
    ).toBe("elevated");
    expect(
      classifySignRisk(summary([PhygitalWalletInstruction.ExecuteWithAuthority])),
    ).toBe("critical");
    expect(
      classifySignRisk(summary([PhygitalWalletInstruction.ClearAuthority])),
    ).toBe("critical");
    expect(
      classifySignRisk(summary([PhygitalWalletInstruction.ClearWalletPolicy])),
    ).toBe("critical");
    expect(
      classifySignRisk(summary([PhygitalWalletInstruction.SetWalletPolicy])),
    ).toBe("elevated");
  });

  it("keeps clear-authority callout short", () => {
    const text = riskCallout(
      summary([PhygitalWalletInstruction.ClearAuthority]).instructions,
    );
    expect(text).toBeTruthy();
    expect(text!.length).toBeLessThan(80);
  });
});
