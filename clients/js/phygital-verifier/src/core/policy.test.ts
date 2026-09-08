import type { Instruction } from "@solana/instructions";
import { describe, expect, it } from "vitest";
import { fromCodamaProgram } from "./adapter.js";
import { aggregate, allow, allowProgram, deny, policy } from "./policy.js";

const PROGRAM_A = "11111111111111111111111111111111";
const PROGRAM_B = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

enum FakeIx {
  Transfer = "Transfer",
  Other = "Other",
}

type FakeParsed =
  | {
      instructionType: FakeIx.Transfer;
      accounts: { destination: { address: string } };
      data: { amount: bigint };
    }
  | {
      instructionType: FakeIx.Other;
      accounts: Record<string, never>;
      data: Record<string, never>;
    };

function makeIx(
  programAddress: string,
  disc: number,
  extra: Uint8Array = new Uint8Array(),
): Instruction {
  return {
    programAddress: programAddress as Instruction["programAddress"],
    data: new Uint8Array([disc, ...extra]),
    accounts: [],
  };
}

const programA = fromCodamaProgram<FakeIx, FakeParsed>({
  programAddress: PROGRAM_A,
  identify(ix) {
    const data = "data" in ix ? ix.data : ix;
    const b = data[0];
    if (b === 1) return FakeIx.Transfer;
    if (b === 2) return FakeIx.Other;
    throw new Error("unknown");
  },
  parse(ix) {
    const b = ix.data![0];
    if (b === 1) {
      return {
        instructionType: FakeIx.Transfer,
        accounts: { destination: { address: "Dest111111111111111111111111111111111111111" } },
        data: { amount: 10n },
      };
    }
    return {
      instructionType: FakeIx.Other,
      accounts: {},
      data: {},
    };
  },
});

describe("policy.verify", () => {
  it("allows matching instruction with predicate", () => {
    const gate = policy([
      allow(programA.instruction(FakeIx.Transfer), (ix) => ix.data.amount <= 100n),
    ]);
    expect(gate.verify([makeIx(PROGRAM_A, 1)]).ok).toBe(true);
  });

  it("rejects when predicate fails", () => {
    const gate = policy([
      allow(programA.instruction(FakeIx.Transfer), (ix) => ix.data.amount <= 5n),
    ]);
    const r = gate.verify([makeIx(PROGRAM_A, 1)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("instruction_not_allowed");
  });

  it("denies before allow", () => {
    const gate = policy([
      deny(programA.instruction(FakeIx.Transfer)),
      allow(programA.instruction(FakeIx.Transfer)),
    ]);
    const r = gate.verify([makeIx(PROGRAM_A, 1)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("instruction_denied");
  });

  it("allowProgram permits any ix for that program", () => {
    const gate = policy([allowProgram(PROGRAM_B)]);
    expect(
      gate.verify([
        {
          programAddress: PROGRAM_B as Instruction["programAddress"],
          data: new Uint8Array([9, 9, 9]),
        },
      ]).ok,
    ).toBe(true);
  });

  it("rejects unknown programs", () => {
    const gate = policy([allow(programA.instruction(FakeIx.Transfer))]);
    const r = gate.verify([
      {
        programAddress: PROGRAM_B as Instruction["programAddress"],
        data: new Uint8Array([1]),
      },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("program_not_allowed");
  });

  it("enforces aggregates", () => {
    const gate = policy([
      allow(programA.instruction(FakeIx.Transfer)),
      aggregate(
        [
          {
            matcher: programA.instruction(FakeIx.Transfer),
            amount: (ix) => ix.data.amount,
          },
        ],
        { lte: 20n },
      ),
    ]);
    expect(gate.verify([makeIx(PROGRAM_A, 1), makeIx(PROGRAM_A, 1)]).ok).toBe(true);
    const over = gate.verify([
      makeIx(PROGRAM_A, 1),
      makeIx(PROGRAM_A, 1),
      makeIx(PROGRAM_A, 1),
    ]);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe("aggregate_limit");
  });
});
