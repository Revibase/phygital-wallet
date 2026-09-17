import { AccountRole, address } from "@solana/kit";
import { describe, expect, it } from "vitest";

import {
  hashExecuteChallenge,
  hashReferencedAccounts,
  packCompactInstructions,
} from "./challenges.js";
import type { CompactInstructionArgs } from "../generated/types/compactInstruction.js";

describe("challenge hashes", () => {
  const emptyCompact: CompactInstructionArgs[] = [];
  const emptyKeys: ReturnType<typeof address>[] = [];

  it("execute challenge is deterministic", () => {
    const slotHash = new Uint8Array(32).fill(7);
    expect(hashExecuteChallenge(slotHash, emptyCompact, emptyKeys)).toEqual(
      hashExecuteChallenge(slotHash, emptyCompact, emptyKeys)
    );
  });

  it("execute challenge changes with slot hash", () => {
    expect(
      hashExecuteChallenge(new Uint8Array(32).fill(7), emptyCompact, emptyKeys)
    ).not.toEqual(
      hashExecuteChallenge(new Uint8Array(32).fill(8), emptyCompact, emptyKeys)
    );
  });

  it("execute challenge binds compact instruction data", () => {
    const slotHash = new Uint8Array(32).fill(3);
    const program = address("11111111111111111111111111111111");
    const a: CompactInstructionArgs[] = [
      {
        programIdIndex: 0,
        accountIndexes: new Uint8Array([]),
        data: new Uint8Array([1, 2, 3]),
      },
    ];
    const b: CompactInstructionArgs[] = [
      {
        programIdIndex: 0,
        accountIndexes: new Uint8Array([]),
        data: new Uint8Array([1, 2, 4]),
      },
    ];
    expect(hashExecuteChallenge(slotHash, a, [program])).not.toEqual(
      hashExecuteChallenge(slotHash, b, [program])
    );
  });

  it("accounts hash changes when remaining keys are reordered", () => {
    const program = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const alice = address("11111111111111111111111111111112");
    const bob = address("Stake11111111111111111111111111111111111111");
    const compact: CompactInstructionArgs[] = [
      {
        programIdIndex: 0,
        accountIndexes: new Uint8Array([1, 2]),
        data: new Uint8Array([9]),
      },
    ];
    expect(hashReferencedAccounts([program, alice, bob], compact)).not.toEqual(
      hashReferencedAccounts([program, bob, alice], compact)
    );
  });

  it("accounts hash changes when privilege flags change", () => {
    const program = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const alice = address("11111111111111111111111111111112");
    const compact: CompactInstructionArgs[] = [
      {
        programIdIndex: 0,
        accountIndexes: new Uint8Array([1]),
        data: new Uint8Array([9]),
      },
    ];
    const readonly = [
      { address: program, role: AccountRole.READONLY },
      { address: alice, role: AccountRole.READONLY },
    ];
    const writable = [
      { address: program, role: AccountRole.READONLY },
      { address: alice, role: AccountRole.WRITABLE },
    ];
    expect(hashReferencedAccounts(readonly, compact)).not.toEqual(
      hashReferencedAccounts(writable, compact)
    );
  });

  it("pack compact matches expected layout", () => {
    const compact: CompactInstructionArgs[] = [
      {
        programIdIndex: 0,
        accountIndexes: new Uint8Array([1, 2]),
        data: new Uint8Array([0xde, 0xad]),
      },
    ];
    expect(Array.from(packCompactInstructions(compact))).toEqual([
      1, 0, 2, 1, 2, 2, 0, 0xde, 0xad,
    ]);
  });
});
