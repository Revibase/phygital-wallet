import type { Instruction } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { PHYGITAL_WALLET_PROGRAM_ADDRESS } from "phygital-wallet-sdk";
import { evaluatePolicy } from "./policy-engine.js";

const SYSTEM = "11111111111111111111111111111111";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SOURCE = "11111111111111111111111111111112";
const DEST = "11111111111111111111111111111113";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AUTH = "11111111111111111111111111111114";

function u64Le(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let x = n;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

function transferSolIx(amount: bigint): Instruction {
  const data = new Uint8Array(12);
  data[0] = 2;
  data.set(u64Le(amount), 4);
  return {
    programAddress: SYSTEM as Instruction["programAddress"],
    data,
    accounts: [
      { address: SOURCE as Instruction["programAddress"], role: 3 },
      { address: DEST as Instruction["programAddress"], role: 1 },
    ],
  };
}

function transferCheckedIx(amount: bigint, decimals: number): Instruction {
  const data = new Uint8Array(1 + 8 + 1);
  data[0] = 12;
  data.set(u64Le(amount), 1);
  data[9] = decimals;
  return {
    programAddress: TOKEN as Instruction["programAddress"],
    data,
    accounts: [
      { address: SOURCE as Instruction["programAddress"], role: 1 },
      { address: MINT as Instruction["programAddress"], role: 0 },
      { address: DEST as Instruction["programAddress"], role: 1 },
      { address: AUTH as Instruction["programAddress"], role: 2 },
    ],
  };
}

describe("evaluatePolicy", () => {
  it("allows when policy is null (opt-in off)", () => {
    expect(evaluatePolicy(null, [transferSolIx(1n)]).ok).toBe(true);
  });

  it("rejects compute-budget-only body", () => {
    const r = evaluatePolicy({ version: "3" }, [
      {
        programAddress: "ComputeBudget111111111111111111111111111111" as never,
        data: new Uint8Array([2]),
      },
    ]);
    expect(r.ok).toBe(false);
  });

  it("soft-denies over-cap SOL as spend_limit with onFail details", () => {
    const r = evaluatePolicy({ version: "3", maxSolLamports: "1000000000" }, [
      transferSolIx(2_000_000_000n),
    ]);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.soft).toBe(true);
    expect(r.code).toBe("spend_limit");
    expect(r.details).toMatchObject({
      instructionName: "TransferSol",
      amountUi: "2",
      destination: DEST,
      symbol: "SOL",
      limit: "1000000000",
    });
  });

  it("soft-denies over-cap SPL TransferChecked as spend_limit", () => {
    const r = evaluatePolicy(
      {
        version: "3",
        mintLimits: [{ mint: MINT, maxRaw: "1000000" }],
      },
      [transferCheckedIx(2_500_000n, 6)],
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.soft).toBe(true);
    expect(r.code).toBe("spend_limit");
    expect(r.details).toMatchObject({
      instructionName: "TransferChecked",
      amountUi: "2.5",
      mint: MINT,
      symbol: "USDC",
      limit: "1000000",
      limitUi: "1",
    });
  });

  it("soft-denies unknown programs with programId details", () => {
    const r = evaluatePolicy({ version: "3" }, [
      {
        programAddress: "FakeProgram1111111111111111111111111111111" as never,
        data: new Uint8Array([1]),
        accounts: [],
      },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.soft).toBe(true);
    expect(r.code).toBe("program_not_allowed");
    expect(r.details?.programId).toBe(
      "FakeProgram1111111111111111111111111111111",
    );
  });

  it("hard-denies wallet-program instructions (config detection is upstream)", () => {
    const r = evaluatePolicy(null, [
      {
        programAddress: PHYGITAL_WALLET_PROGRAM_ADDRESS as never,
        data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        accounts: [],
      },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.soft).toBe(false);
    expect(r.code).toBe("program_not_allowed");
  });

  it("allows AdvanceNonceAccount", () => {
    const r = evaluatePolicy({ version: "3" }, [
      {
        programAddress: SYSTEM as never,
        data: new Uint8Array([4, 0, 0, 0]),
        accounts: [
          { address: SOURCE as never, role: 1 },
          {
            address: "SysvarRecentB1ockHashes11111111111111111111" as never,
            role: 0,
          },
          { address: AUTH as never, role: 2 },
        ],
      },
    ]);
    expect(r.ok).toBe(true);
  });
});
