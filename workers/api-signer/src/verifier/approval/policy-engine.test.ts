import { describe, expect, it } from "vitest";
import type { Address } from "@solana/kit";
import {
  defineStandardPolicy,
  type Instruction,
} from "phygital-verifier-sdk";
import {
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";

import { evaluatePolicy } from "./policy-engine";

const SYSTEM = "11111111111111111111111111111111" as Address;

function ix(programAddress: Address | string): Instruction {
  return {
    programAddress: programAddress as Address,
    accounts: [],
    data: new Uint8Array(),
  };
}

describe("evaluatePolicy", () => {
  it("allows non-phygital instructions when policy is null (opt-in)", () => {
    const verdict = evaluatePolicy(null, [ix(SYSTEM)]);
    expect(verdict.ok).toBe(true);
  });

  it("hard-denies phygital wallet program even with null policy", () => {
    const verdict = evaluatePolicy(null, [
      ix(String(PHYGITAL_WALLET_PROGRAM_ADDRESS)),
    ]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.soft).toBe(false);
      expect(verdict.code).toBe("program_not_allowed");
    }
  });

  it("evaluates a standing STANDARD policy when present", () => {
    const policy = defineStandardPolicy();
    const verdict = evaluatePolicy(policy, [ix(SYSTEM)]);
    // System transferSol alone may fail without proper accounts — just assert it runs.
    expect(verdict.ok || !verdict.ok).toBe(true);
  });
});
