import { describe, expect, it } from "vitest";
import { PhygitalWalletInstruction } from "phygital-wallet-sdk";
import {
  classifySignRisk,
  HIGH_RISK_CONFIRM_PHRASE,
  instructionLabel,
  isHighRiskInstruction,
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
  it("labels escape-hatch spends clearly", () => {
    expect(
      instructionLabel(PhygitalWalletInstruction.ExecuteWithAuthority),
    ).toMatch(/bypasses accessory policy/i);
  });

  it("treats owner spend and clear-authority as high risk", () => {
    expect(
      isHighRiskInstruction(PhygitalWalletInstruction.ExecuteWithAuthority),
    ).toBe(true);
    expect(
      isHighRiskInstruction(PhygitalWalletInstruction.ClearAuthority),
    ).toBe(true);
    expect(classifySignRisk(summary([PhygitalWalletInstruction.Execute]))).toBe(
      "normal",
    );
    expect(
      classifySignRisk(
        summary([PhygitalWalletInstruction.ExecuteWithAuthority]),
      ),
    ).toBe("high");
  });

  it("exports a stable typed confirm phrase", () => {
    expect(HIGH_RISK_CONFIRM_PHRASE).toBe("AUTHORIZE");
  });
});
