import { address } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { getTransferSolInstruction } from "./generated/system/instructions/transferSol.js";
import { buildPaymentsPolicy } from "./payments-policy.js";

describe("buildPaymentsPolicy", () => {
  it("allows empty instruction lists", () => {
    const gate = buildPaymentsPolicy({ version: "3" });
    expect(gate.rules.length).toBeGreaterThan(0);
    expect(gate.verify([]).ok).toBe(true);
  });

  it("denies Compute Budget by program", () => {
    const gate = buildPaymentsPolicy({ version: "3" });
    const r = gate.verify([
      {
        programAddress:
          "ComputeBudget111111111111111111111111111111" as never,
        data: new Uint8Array([2]),
      },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("instruction_denied");
  });

  it("allows SOL transfer under cap", () => {
    const gate = buildPaymentsPolicy({
      version: "3",
      maxSolLamports: "100000000",
    });
    const ix = getTransferSolInstruction({
      source: address("11111111111111111111111111111112"),
      destination: address("11111111111111111111111111111113"),
      amount: 50_000_000n,
    });
    expect(gate.verify([ix]).ok).toBe(true);
  });

  it("rejects SOL transfer over per-ix and aggregate cap", () => {
    const gate = buildPaymentsPolicy({
      version: "3",
      maxSolLamports: "1000",
    });
    const ix = getTransferSolInstruction({
      source: address("11111111111111111111111111111112"),
      destination: address("11111111111111111111111111111113"),
      amount: 2000n,
    });
    const r = gate.verify([ix]);
    expect(r.ok).toBe(false);
  });
});
