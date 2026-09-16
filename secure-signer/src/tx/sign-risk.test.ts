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
): TransactionSummary {
  return {
    walletAddress: "Wallet111111111111111111111111111111111",
    ownerSignerIndex: 0,
    instructions: kinds.map((kind) => ({
      kind,
      authority: null,
      phygitalToken: null,
      inner: null,
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

  it("treats owner spend as normal review, clear-authority as critical", () => {
    expect(
      isCriticalInstruction(PhygitalWalletInstruction.ExecuteWithAuthority),
    ).toBe(false);
    expect(
      isCriticalInstruction(PhygitalWalletInstruction.ClearAuthority),
    ).toBe(true);
    expect(
      isElevatedInstruction(PhygitalWalletInstruction.SetWalletPolicy),
    ).toBe(true);
    expect(classifySignRisk(summary([PhygitalWalletInstruction.Execute]))).toBe(
      "normal",
    );
    expect(
      classifySignRisk(
        summary([PhygitalWalletInstruction.ExecuteWithAuthority]),
      ),
    ).toBe("normal");
    expect(
      classifySignRisk(summary([PhygitalWalletInstruction.ClearAuthority])),
    ).toBe("critical");
    expect(
      classifySignRisk(summary([PhygitalWalletInstruction.SetWalletPolicy])),
    ).toBe("elevated");
  });

  it("keeps callouts short", () => {
    const text = riskCallout(
      summary([PhygitalWalletInstruction.ClearAuthority]).instructions,
    );
    expect(text).toBeTruthy();
    expect(text!.length).toBeLessThan(80);
  });
});
