import { describe, expect, it } from "vitest";
import { address, getAddressEncoder } from "@solana/addresses";
import { AccountRole, type Address, type Instruction } from "@solana/instructions";
import {
  STANDARD_PARSERS,
  createVerifier,
  definePolicy,
  defineProgram,
  defineStandardPolicy,
  tokenParser,
  validatePolicy,
} from "../index.js";

const USDC =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as Address;
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
const SYSTEM = "11111111111111111111111111111111" as Address;
const ATA = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

const addressEncoder = getAddressEncoder();

function encodePubkey(s: string): Uint8Array {
  return new Uint8Array(addressEncoder.encode(address(s)));
}

function addr(s: string): Address {
  return s as Address;
}

function meta(a: string, role: AccountRole = AccountRole.READONLY) {
  return { address: addr(a), role };
}

function u64Le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  const v = n;
  for (let i = 0; i < 8; i++) b[i] = Number((v >> BigInt(8 * i)) & 0xffn);
  return b;
}

function transferChecked(amount: bigint, mint = String(USDC)): Instruction {
  const data = new Uint8Array(1 + 8 + 1);
  data[0] = 12;
  data.set(u64Le(amount), 1);
  data[9] = 6;
  return {
    programAddress: TOKEN,
    accounts: [
      meta("Src111111111111111111111111111111111111111"),
      meta(mint),
      meta("Dst111111111111111111111111111111111111111"),
      meta("Auth11111111111111111111111111111111111111"),
    ],
    data,
  };
}

function transferSol(lamports: bigint): Instruction {
  const data = new Uint8Array(4 + 8);
  data[0] = 2;
  data.set(u64Le(lamports), 4);
  return {
    programAddress: SYSTEM,
    accounts: [
      meta("From11111111111111111111111111111111111111"),
      meta("To1111111111111111111111111111111111111111"),
    ],
    data,
  };
}

function createAta(): Instruction {
  return {
    programAddress: ATA,
    accounts: [
      meta("Payer1111111111111111111111111111111111111"),
      meta("Ata111111111111111111111111111111111111111"),
      meta("Owner1111111111111111111111111111111111111"),
      meta(String(USDC)),
      meta(String(SYSTEM)),
      meta(String(TOKEN)),
    ],
    data: new Uint8Array([1]),
  };
}

describe("layouts / parsers", () => {
  it("parses transferChecked amount and mint via full parser", () => {
    const ix = transferChecked(10_000_000n);
    const parsed = tokenParser.parse(ix);
    expect(parsed.instructionName).toBe("transferChecked");
    expect(parsed.fields.amount?.value).toBe(10_000_000n);
    expect(parsed.fields.mint?.value).toBe(String(USDC));
  });

  it("unknown disc → Unknown", () => {
    const ix: Instruction = {
      programAddress: TOKEN,
      accounts: [],
      data: new Uint8Array([250]),
    };
    expect(tokenParser.parse(ix).instructionName).toBe("Unknown");
  });
});

describe("defineStandardPolicy + verify", () => {
  const verify = createVerifier({ parsers: [...STANDARD_PARSERS] });
  const policy = defineStandardPolicy({
    maxMintRaw: "50000000",
    maxSolLamports: "100000000",
  });
  const uncapped = defineStandardPolicy();

  it("validatePolicy accepts STANDARD", () => {
    expect(validatePolicy(policy).ok).toBe(true);
  });

  it("uncapped STANDARD allows large USDC without aggregates", () => {
    expect(uncapped.transaction).toBeUndefined();
    const r = verify(uncapped, [transferChecked(100_000_000n)]);
    expect(r).toEqual({ ok: true });
  });

  it("allows under-cap USDC + ATA", () => {
    const ixs = [createAta(), transferChecked(10_000_000n)];
    const r = verify(policy, ixs);
    expect(r).toEqual({ ok: true });
  });

  it("rejects over-cap USDC with spend_limit and instructionIndex", () => {
    const ixs = [transferChecked(100_000_000n)];
    const r = verify(policy, ixs);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("spend_limit");
    expect(r.details?.instructionIndex).toBe(0);
    expect(r.details?.mint).toBe(String(USDC));
    expect(r.details?.amount).toBe("100000000");
    expect(r.details?.destination).toBe(
      "Dst111111111111111111111111111111111111111",
    );
    expect(r.details?.instructionName).toBe("transferChecked");
    expect(r.details?.programId).toBe(String(TOKEN));
  });

  it("rejects over-cap SOL", () => {
    const r = verify(policy, [transferSol(200_000_000n)]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(["spend_limit", "aggregate_limit"]).toContain(r.code);
  });

  it("anti-split: two under-cap transfers over aggregate", () => {
    const ixs = [
      transferChecked(30_000_000n),
      transferChecked(30_000_000n),
    ];
    const r = verify(policy, ixs);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("aggregate_limit");
  });

  it("rejects compute budget", () => {
    const r = verify(policy, [
      {
        programAddress:
          "ComputeBudget111111111111111111111111111111" as Address,
        data: new Uint8Array([2, 0, 0, 0]),
      },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("compute_budget_not_allowed");
  });

  it("rejects transferChecked with trailing bytes (exact length)", () => {
    const ix = transferChecked(10_000_000n);
    const padded = new Uint8Array(ix.data!.length + 1);
    padded.set(ix.data!);
    const bad: Instruction = { ...ix, data: padded };
    const r = verify(policy, [bad]);
    expect(r.ok).toBe(false);
  });

  it("rejects ATA createIdempotent with trailing bytes", () => {
    const r = verify(policy, [
      {
        ...createAta(),
        data: new Uint8Array([1, 0]),
      },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects non-PolicyDocument input", () => {
    const r = verify(null as never, [transferChecked(1n)]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("invalid_policy");
  });

  it("mint eq uses 32-byte memcmp (rejects wrong mint above NFT amount)", () => {
    // amount > 1 so the collectibles transferChecked (amount ≤ 1) allow does not match
    const r = verify(policy, [
      transferChecked(2n, "So11111111111111111111111111111111111111112"),
    ]);
    expect(r.ok).toBe(false);
  });

  it("data pubkey owner eq via memcmp (system assign)", () => {
    const ownerBytes = encodePubkey(String(TOKEN));
    const data = new Uint8Array(4 + 32);
    data[0] = 1;
    data.set(ownerBytes, 4);
    const ix: Instruction = {
      programAddress: SYSTEM,
      accounts: [meta(String(SYSTEM))],
      data,
    };
    const pol = {
      programs: [
        {
          programId: String(SYSTEM),
          allows: [
            {
              instruction: "assign",
              when: {
                field: "owner",
                type: "string" as const,
                op: "eq" as const,
                value: String(TOKEN),
              },
            },
          ],
        },
      ],
    };
    expect(verify(pol, [ix])).toEqual({ ok: true });
    const badOwner = new Uint8Array(ownerBytes);
    badOwner[0] ^= 1;
    const badData = new Uint8Array(data);
    badData.set(badOwner, 4);
    expect(verify(pol, [{ ...ix, data: badData }]).ok).toBe(false);
  });

  it("or-groups compile and match either branch", () => {
    const pol = {
      programs: [
        {
          programId: String(TOKEN),
          allows: [
            {
              instruction: "transferChecked",
              when: {
                or: [
                  {
                    and: [
                      {
                        field: "mint",
                        type: "string" as const,
                        op: "eq" as const,
                        value: String(USDC),
                      },
                      {
                        field: "amount",
                        type: "bigint" as const,
                        op: "lte" as const,
                        value: "100",
                      },
                    ],
                  },
                  {
                    field: "amount",
                    type: "bigint" as const,
                    op: "eq" as const,
                    value: "1",
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(verify(pol, [transferChecked(1n)]).ok).toBe(true);
    expect(verify(pol, [transferChecked(50n)]).ok).toBe(true);
    expect(verify(pol, [transferChecked(200n)]).ok).toBe(false);
  });

  it("not leaf inverts eq", () => {
    const pol = {
      programs: [
        {
          programId: String(TOKEN),
          allows: [
            {
              instruction: "transferChecked",
              when: {
                and: [
                  {
                    not: {
                      field: "mint",
                      type: "string" as const,
                      op: "eq" as const,
                      value: String(USDC),
                    },
                  },
                  {
                    field: "amount",
                    type: "bigint" as const,
                    op: "lte" as const,
                    value: "10",
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(
      verify(pol, [
        transferChecked(1n, "So11111111111111111111111111111111111111112"),
      ]).ok,
    ).toBe(true);
    expect(verify(pol, [transferChecked(1n)]).ok).toBe(false);
  });

  it("rejects uncompilable nested not", () => {
    const pol = {
      programs: [
        {
          programId: String(TOKEN),
          allows: [
            {
              instruction: "transferChecked",
              when: {
                not: {
                  and: [
                    {
                      field: "amount",
                      type: "bigint" as const,
                      op: "eq" as const,
                      value: "1",
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    };
    const r = verify(pol, [transferChecked(1n)]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("invalid_policy");
  });
});

describe("allowAll without parser", () => {
  const OTHER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" as Address;

  it("programId + allowAll works with empty parsers list", () => {
    const verify = createVerifier({ parsers: [] });
    const policy = {
      version: "2.0" as const,
      programs: [{ programId: String(OTHER), allowAll: true }],
    };
    const r = verify(policy, [
      { programAddress: OTHER, data: new Uint8Array([9, 9, 9]) },
    ]);
    expect(r).toEqual({ ok: true });
  });

  it("defineProgram(programId, { allowAll }) needs no parser", () => {
    const verify = createVerifier({ parsers: [...STANDARD_PARSERS] });
    const policy = definePolicy([
      defineProgram(String(OTHER), { allowAll: true }),
    ]);
    expect(
      verify(policy, [
        { programAddress: OTHER, accounts: [], data: new Uint8Array([1]) },
      ]),
    ).toEqual({ ok: true });
  });

  it("allowAll + denies without parser fails closed", () => {
    const verify = createVerifier({ parsers: [] });
    const policy = {
      version: "2.0" as const,
      programs: [
        {
          programId: String(OTHER),
          allowAll: true,
          denies: [{ instruction: "setTokenLedger" }],
        },
      ],
    };
    const r = verify(policy, [
      { programAddress: OTHER, data: new Uint8Array([1]) },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("parser_not_found");
  });
});
