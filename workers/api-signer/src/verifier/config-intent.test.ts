import type { Instruction } from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
  getSetRecoveryWalletInstructionDataEncoder,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";

import { hashConfigIntent, parseConfigIntent } from "./config-intent.js";

const PT = "So11111111111111111111111111111111111111112";
const RECOVERY_A = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const RECOVERY_B = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const FILLER = "11111111111111111111111111111112";

/**
 * A SetRecoveryWallet instruction. `secp256r1VerifyArgs` / `slotNumber` are the
 * perishable proof fields — vary them to prove they don't affect the intent.
 */
function setRecoveryWalletIx(opts: {
  recoveryWallet: string;
  slotNumber: number;
  clientDataJson: Uint8Array;
}): Instruction {
  const data = getSetRecoveryWalletInstructionDataEncoder().encode({
    recoveryWallet: opts.recoveryWallet as never,
    secp256r1VerifyArgs: {
      verifyArgsRelativeIndex: 0,
      signedMessageIndex: 0,
      clientDataJson: opts.clientDataJson,
    },
    slotNumber: opts.slotNumber,
  });
  const a = (addr: string) => ({
    address: addr as Instruction["programAddress"],
    role: 0,
  });
  // phygitalToken is account index 3; 10 accounts required.
  return {
    programAddress:
      PHYGITAL_WALLET_PROGRAM_ADDRESS as Instruction["programAddress"],
    data: new Uint8Array(data),
    accounts: [
      a(FILLER),
      a(FILLER),
      a(FILLER),
      a(PT),
      a(FILLER),
      a(FILLER),
      a(FILLER),
      a(FILLER),
      a(FILLER),
      a(FILLER),
    ],
  };
}

describe("config intent hash", () => {
  it("parses the semantic fields, ignoring the proof", () => {
    const intent = parseConfigIntent(
      setRecoveryWalletIx({
        recoveryWallet: RECOVERY_A,
        slotNumber: 123,
        clientDataJson: new Uint8Array([1, 2, 3]),
      }),
    );
    expect(intent).toEqual({
      action: "set_recovery_wallet",
      phygitalToken: PT,
      recoveryWallet: RECOVERY_A,
    });
  });

  it("is stable across different Secp256r1 proofs / slots (preview ≡ sign)", async () => {
    const preview = parseConfigIntent(
      setRecoveryWalletIx({
        recoveryWallet: RECOVERY_A,
        slotNumber: 0,
        clientDataJson: new Uint8Array(),
      }),
    );
    const signed = parseConfigIntent(
      setRecoveryWalletIx({
        recoveryWallet: RECOVERY_A,
        slotNumber: 987654,
        clientDataJson: new Uint8Array([9, 9, 9, 9]),
      }),
    );
    expect(preview).not.toBeNull();
    expect(signed).not.toBeNull();
    expect(await hashConfigIntent(preview!)).toBe(
      await hashConfigIntent(signed!),
    );
  });

  it("changes when the semantic target changes", async () => {
    const a = parseConfigIntent(
      setRecoveryWalletIx({
        recoveryWallet: RECOVERY_A,
        slotNumber: 0,
        clientDataJson: new Uint8Array(),
      }),
    );
    const b = parseConfigIntent(
      setRecoveryWalletIx({
        recoveryWallet: RECOVERY_B,
        slotNumber: 0,
        clientDataJson: new Uint8Array(),
      }),
    );
    expect(await hashConfigIntent(a!)).not.toBe(await hashConfigIntent(b!));
  });

  it("returns null for a non-wallet instruction", () => {
    expect(
      parseConfigIntent({
        programAddress: FILLER as Instruction["programAddress"],
        data: new Uint8Array([1, 2, 3]),
        accounts: [],
      }),
    ).toBeNull();
  });
});
