import { address, getAddressEncoder } from "@solana/kit";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it } from "vitest";

import {
  hashExecuteChallenge,
  hashReferencedAccounts,
  packCompactInstructions,
} from "./challenges.js";
import type { CompactInstructionArgs } from "../generated/types/compactInstruction.js";

function hashSetTokenVerifier(
  slotHash: Uint8Array,
  phygitalToken: ReturnType<typeof address>,
  verifier: ReturnType<typeof address>,
  endpoint: string,
): Uint8Array {
  const prefix = new TextEncoder().encode("phygital_wallet:set_tv:v1");
  const tokenBytes = new Uint8Array(getAddressEncoder().encode(phygitalToken));
  const verifierBytes = new Uint8Array(getAddressEncoder().encode(verifier));
  const endpointBytes = new TextEncoder().encode(endpoint);
  const preimage = new Uint8Array(
    prefix.length +
      32 +
      tokenBytes.length +
      verifierBytes.length +
      endpointBytes.length,
  );
  let offset = 0;
  preimage.set(prefix, offset);
  offset += prefix.length;
  preimage.set(slotHash, offset);
  offset += 32;
  preimage.set(tokenBytes, offset);
  offset += tokenBytes.length;
  preimage.set(verifierBytes, offset);
  offset += verifierBytes.length;
  preimage.set(endpointBytes, offset);
  return sha256(preimage);
}

function hashClearTokenVerifier(
  slotHash: Uint8Array,
  phygitalToken: ReturnType<typeof address>,
): Uint8Array {
  const prefix = new TextEncoder().encode("phygital_wallet:clear_tv:v1");
  const tokenBytes = new Uint8Array(getAddressEncoder().encode(phygitalToken));
  const preimage = new Uint8Array(prefix.length + 32 + tokenBytes.length);
  let offset = 0;
  preimage.set(prefix, offset);
  offset += prefix.length;
  preimage.set(slotHash, offset);
  offset += 32;
  preimage.set(tokenBytes, offset);
  return sha256(preimage);
}

describe("challenge hashes", () => {
  const emptyCompact: CompactInstructionArgs[] = [];
  const emptyKeys: ReturnType<typeof address>[] = [];

  it("execute challenge is deterministic", () => {
    const slotHash = new Uint8Array(32).fill(7);
    expect(
      hashExecuteChallenge(slotHash, emptyCompact, emptyKeys),
    ).toEqual(hashExecuteChallenge(slotHash, emptyCompact, emptyKeys));
  });

  it("execute challenge changes with slot hash", () => {
    expect(
      hashExecuteChallenge(new Uint8Array(32).fill(7), emptyCompact, emptyKeys),
    ).not.toEqual(
      hashExecuteChallenge(new Uint8Array(32).fill(8), emptyCompact, emptyKeys),
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
      hashExecuteChallenge(slotHash, b, [program]),
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
    expect(
      hashReferencedAccounts([program, alice, bob], compact),
    ).not.toEqual(hashReferencedAccounts([program, bob, alice], compact));
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

  it("set token verifier challenge binds token, verifier and endpoint", () => {
    const slotHash = new Uint8Array(32).fill(4);
    const phygitalToken = address("11111111111111111111111111111111");
    const verifier = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const endpoint = "https://verifier.example.com/submit";
    expect(
      hashSetTokenVerifier(slotHash, phygitalToken, verifier, endpoint),
    ).toEqual(
      hashSetTokenVerifier(slotHash, phygitalToken, verifier, endpoint),
    );
    expect(
      hashSetTokenVerifier(slotHash, phygitalToken, verifier, endpoint),
    ).not.toEqual(
      hashSetTokenVerifier(
        slotHash,
        phygitalToken,
        address("11111111111111111111111111111112"),
        endpoint,
      ),
    );
    expect(
      hashSetTokenVerifier(slotHash, phygitalToken, verifier, endpoint),
    ).not.toEqual(
      hashSetTokenVerifier(
        slotHash,
        address("11111111111111111111111111111112"),
        verifier,
        endpoint,
      ),
    );
  });

  it("clear token verifier challenge binds phygital token", () => {
    const slotHash = new Uint8Array(32).fill(6);
    const phygitalToken = address("11111111111111111111111111111111");
    expect(hashClearTokenVerifier(slotHash, phygitalToken)).toEqual(
      hashClearTokenVerifier(slotHash, phygitalToken),
    );
    expect(hashClearTokenVerifier(slotHash, phygitalToken)).not.toEqual(
      hashClearTokenVerifier(
        slotHash,
        address("11111111111111111111111111111112"),
      ),
    );
  });
});
