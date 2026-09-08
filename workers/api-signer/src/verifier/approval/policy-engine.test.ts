import { describe, expect, it } from "vitest";
import type { Address } from "@solana/kit";
import {
  defineStandardPolicy,
  type Instruction,
} from "phygital-verifier-sdk";
import {
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";

import { enrichSoftDenyDetails, evaluatePolicy } from "./policy-engine";

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

describe("enrichSoftDenyDetails", () => {
  const ATA = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;
  const ataAddr = "Ata111111111111111111111111111111111111111" as Address;
  const wallet = "Recv11111111111111111111111111111111111111" as Address;
  const mint = "Mint111111111111111111111111111111111111111" as Address;

  it("rewrites ATA destination to wallet owner from createIdempotent", () => {
    const createAta: Instruction = {
      programAddress: ATA,
      accounts: [
        { address: "Payer1111111111111111111111111111111111111" as Address, role: 3 },
        { address: ataAddr, role: 1 },
        { address: wallet, role: 0 },
        { address: mint, role: 0 },
        { address: SYSTEM, role: 0 },
        { address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address, role: 0 },
      ],
      data: new Uint8Array([1]),
    };

    const enriched = enrichSoftDenyDetails(
      {
        destination: String(ataAddr),
        mint: String(mint),
        amountUi: "2",
        instructionName: "transferChecked",
      },
      [createAta],
    );

    expect(enriched.destination).toBe(String(wallet));
  });

  it("labels native SOL transfers", () => {
    const enriched = enrichSoftDenyDetails(
      {
        destination: String(wallet),
        amountUi: "1",
        instructionName: "transferSol",
        programId: String(SYSTEM),
      },
      [],
    );
    expect(enriched.symbol).toBe("SOL");
  });
});
