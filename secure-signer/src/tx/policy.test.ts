import { describe, expect, it } from "vitest";
import {
  AccountRole,
  createNoopSigner,
  getAddressDecoder,
  type AccountMeta,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  compileWalletInstructions,
  getExecuteWithAuthorityInstruction,
  PhygitalWalletInstruction,
} from "phygital-wallet-sdk";
import { ed25519PublicKey, ed25519Sign, generateEd25519Seed, randomBytes } from "../crypto.js";
import { encodeV1Wire } from "../testing/encode-v1.js";
import { decodeV1Transaction } from "./decode-v1.js";
import { evaluatePolicy } from "./policy.js";
import { ed25519 } from "@noble/curves/ed25519.js";

const addr = getAddressDecoder();
const SYSTEM = "11111111111111111111111111111111" as Address;
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111" as Address;
const randomAddress = (): Address => addr.decode(randomBytes(32));

function buildExecuteWithAuthorityWire(ownerPub: Uint8Array, dest: Address) {
  const ownerAddress = addr.decode(ownerPub);
  const phygitalToken = randomAddress();
  const authorityAccount = randomAddress();
  const wallet = randomAddress();

  // Inner: a System transfer from the wallet PDA to `dest`.
  const innerIx: Instruction & { accounts: AccountMeta[]; data: Uint8Array } = {
    programAddress: SYSTEM,
    accounts: [
      { address: wallet, role: AccountRole.WRITABLE_SIGNER },
      { address: dest, role: AccountRole.WRITABLE },
    ],
    data: Uint8Array.from([2, 0, 0, 0, 0, 202, 154, 59, 0, 0, 0, 0]), // transfer 1e9
  };
  const { compactInstructions, remainingAccounts } = compileWalletInstructions([innerIx], wallet);

  const base = getExecuteWithAuthorityInstruction({
    authority: createNoopSigner(ownerAddress),
    phygitalToken,
    authorityAccount,
    wallet,
    compactInstructions,
  });
  const ix = { ...base, accounts: [...base.accounts, ...remainingAccounts] };

  return {
    wire: encodeV1Wire({ feePayer: randomAddress(), instructions: [ix] }),
    ownerAddress,
    wallet,
    phygitalToken,
  };
}

describe("evaluatePolicy (executeWithAuthority)", () => {
  it("accepts an owner-signed executeWithAuthority and clear-signs the inner spend", () => {
    const seed = generateEd25519Seed();
    const ownerPub = ed25519PublicKey(seed);
    const dest = randomAddress();
    const { wire, ownerAddress, wallet } = buildExecuteWithAuthorityWire(ownerPub, dest);

    const tx = decodeV1Transaction(wire);
    const result = evaluatePolicy(tx, ownerPub);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.summary.walletAddress).toBe(ownerAddress);
    expect(result.summary.instructions).toHaveLength(1);
    const s = result.summary.instructions[0]!;
    expect(s.kind).toBe(PhygitalWalletInstruction.ExecuteWithAuthority);
    expect(s.authority).toBe(ownerAddress);
    expect(s.inner).not.toBeNull();
    expect(s.inner![0]!.programAddress).toBe(SYSTEM);
    expect(s.inner![0]!.accounts).toContain(dest);
    expect(s.inner![0]!.accounts).toContain(wallet);
    expect(s.inner![0]!.title).toBe("Send 1 SOL");
    expect(s.inner![0]!.details.some((d) => d.label === "To")).toBe(true);

    // The signature covers EXACTLY the decoded message bytes.
    const sig = ed25519Sign(tx.messageBytes, seed);
    expect(ed25519.verify(sig, tx.messageBytes, ownerPub)).toBe(true);
  });

  it("rejects when the authenticated wallet is not a signer (WALLET_MISMATCH)", () => {
    const seed = generateEd25519Seed();
    const ownerPub = ed25519PublicKey(seed);
    const { wire } = buildExecuteWithAuthorityWire(ownerPub, randomAddress());
    const tx = decodeV1Transaction(wire);

    const strangerPub = ed25519PublicKey(generateEd25519Seed());
    const result = evaluatePolicy(tx, strangerPub);
    expect(result).toMatchObject({ ok: false, code: "WALLET_MISMATCH" });
  });

  it("rejects a non-allowlisted top-level program", () => {
    const seed = generateEd25519Seed();
    const ownerPub = ed25519PublicKey(seed);
    const ownerAddress = addr.decode(ownerPub);
    const ix = {
      programAddress: SYSTEM,
      accounts: [{ address: ownerAddress, role: AccountRole.WRITABLE_SIGNER }],
      data: Uint8Array.from([1, 2, 3]),
    };
    const tx = decodeV1Transaction(
      encodeV1Wire({ feePayer: ownerAddress, instructions: [ix] }),
    );
    expect(evaluatePolicy(tx, ownerPub)).toMatchObject({ ok: false, code: "POLICY_REJECTED" });
  });

  it("rejects a ComputeBudget instruction explicitly (§18)", () => {
    const seed = generateEd25519Seed();
    const ownerPub = ed25519PublicKey(seed);
    const ownerAddress = addr.decode(ownerPub);
    const ix = {
      programAddress: COMPUTE_BUDGET,
      accounts: [] as AccountMeta[],
      data: Uint8Array.from([2, 64, 66, 15, 0]),
    };
    const tx = decodeV1Transaction(
      encodeV1Wire({ feePayer: ownerAddress, instructions: [ix] }),
    );
    expect(evaluatePolicy(tx, ownerPub)).toMatchObject({ ok: false, code: "POLICY_REJECTED" });
  });
});
