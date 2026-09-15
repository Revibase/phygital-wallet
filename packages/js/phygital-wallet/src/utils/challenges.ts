import {
  getAddressEncoder,
  getBase64Encoder,
  getU64Decoder,
  isSignerRole,
  isWritableRole,
  type AccountMeta,
  type Address,
  type GetAccountInfoApi,
  type Rpc,
} from "@solana/kit";
import { sha256 } from "@noble/hashes/sha2.js";

import { SLOT_HASHES_SYSVAR_ADDRESS } from "../constants.js";
import type { CompactInstructionArgs } from "../generated/types/compactInstruction.js";

const addressEncoder = getAddressEncoder();
const base64Encoder = getBase64Encoder();
const u64Decoder = getU64Decoder();
const slotHashesAddress = SLOT_HASHES_SYSVAR_ADDRESS as Address;

const EXECUTE_CHALLENGE_PREFIX = new TextEncoder().encode(
  "phygital_wallet:execute:v3"
);
const SET_AUTHORITY_CHALLENGE_PREFIX = new TextEncoder().encode(
  "phygital_wallet:set_authority:v1"
);

type SlotChallenge = {
  slotNumber: bigint;
  messageHash: Uint8Array;
};

export type SlotEntry = {
  slotNumber: bigint;
  slotHash: Uint8Array;
};

/** Remaining-account entry for `accounts_hash` (pubkey + privilege flags). */
type ChallengeAccount = {
  address: Address;
  isSigner: boolean;
  isWritable: boolean;
};

export async function fetchLatestSlotHash(
  rpc: Rpc<GetAccountInfoApi>,
  abortSignal?: AbortSignal
): Promise<SlotEntry> {
  const { value } = await rpc
    .getAccountInfo(slotHashesAddress, {
      encoding: "base64",
      commitment: "confirmed",
      dataSlice: { offset: 8, length: 40 },
    })
    .send({ abortSignal });

  const data = value?.data;
  if (!data) {
    throw new Error("Unable to fetch SlotHashes sysvar");
  }

  const base64 = Array.isArray(data) ? data[0] : data;
  const bytes = new Uint8Array(base64Encoder.encode(base64));

  return {
    slotNumber: u64Decoder.decode(bytes.subarray(0, 8)),
    slotHash: bytes.subarray(8, 40),
  };
}

async function withSlotChallenge(
  rpc: Rpc<GetAccountInfoApi>,
  hashMessage: (slotHash: Uint8Array) => Uint8Array
): Promise<SlotChallenge> {
  const { slotNumber, slotHash } = await fetchLatestSlotHash(rpc);
  return { slotNumber, messageHash: hashMessage(slotHash) };
}

/**
 * Packed compact format for `instructions_hash`:
 * `[num][progIdx][nAcc][indexes...][dataLen LE u16][data...]...`
 */
export function packCompactInstructions(
  instructions: readonly CompactInstructionArgs[]
): Uint8Array {
  if (instructions.length > 255) {
    throw new Error("Too many compact instructions for u8 count");
  }

  let size = 1;
  for (const ix of instructions) {
    if (ix.accountIndexes.length > 255) {
      throw new Error("Too many account indexes for u8 count");
    }
    if (ix.data.length > 0xffff) {
      throw new Error("Instruction data exceeds u16 length");
    }
    size += 1 + 1 + ix.accountIndexes.length + 2 + ix.data.length;
  }

  const out = new Uint8Array(size);
  let offset = 0;
  out[offset++] = instructions.length;
  for (const ix of instructions) {
    out[offset++] = ix.programIdIndex;
    out[offset++] = ix.accountIndexes.length;
    out.set(ix.accountIndexes, offset);
    offset += ix.accountIndexes.length;
    out[offset++] = ix.data.length & 0xff;
    out[offset++] = (ix.data.length >> 8) & 0xff;
    out.set(ix.data, offset);
    offset += ix.data.length;
  }
  return out;
}

function privilegeByte(isSigner: boolean, isWritable: boolean): number {
  return (isSigner ? 1 : 0) | (isWritable ? 2 : 0);
}

function toChallengeAccount(account: AccountMeta | Address): ChallengeAccount {
  if (typeof account === "string") {
    return { address: account, isSigner: false, isWritable: false };
  }
  return {
    address: account.address,
    isSigner: isSignerRole(account.role),
    isWritable: isWritableRole(account.role),
  };
}

/**
 * `accounts_hash` over remaining accounts: each referenced entry contributes
 * `pubkey (32) || privilege_byte (1)` where bit0=signer and bit1=writable.
 * Privilege packing is program wire format (not Kit `AccountRole` bit order).
 */
export function hashReferencedAccounts(
  remainingAccounts: readonly (AccountMeta | Address)[],
  instructions: readonly CompactInstructionArgs[]
): Uint8Array {
  const accounts = remainingAccounts.map(toChallengeAccount);
  const encoded = new Map<Address, Uint8Array>();
  const encode = (key: Address) => {
    let bytes = encoded.get(key);
    if (!bytes) {
      bytes = new Uint8Array(addressEncoder.encode(key));
      encoded.set(key, bytes);
    }
    return bytes;
  };

  let size = 0;
  for (const ix of instructions) {
    size += 33 * (1 + ix.accountIndexes.length);
  }
  const buf = new Uint8Array(size);
  let offset = 0;

  const pushAccount = (account: ChallengeAccount) => {
    const keyBytes = encode(account.address);
    buf.set(keyBytes, offset);
    offset += keyBytes.length;
    buf[offset++] = privilegeByte(account.isSigner, account.isWritable);
  };

  for (const ix of instructions) {
    const program = accounts[ix.programIdIndex];
    if (program === undefined) {
      throw new Error(`Invalid program_id_index ${ix.programIdIndex}`);
    }
    pushAccount(program);

    for (const idx of ix.accountIndexes) {
      const account = accounts[idx];
      if (account === undefined) {
        throw new Error(`Invalid account index ${idx}`);
      }
      pushAccount(account);
    }
  }

  return sha256(buf);
}

export function hashExecuteChallenge(
  slotHash: Uint8Array,
  compactInstructions: readonly CompactInstructionArgs[],
  remainingAccounts: readonly (AccountMeta | Address)[]
): Uint8Array {
  const instructionsHash = sha256(packCompactInstructions(compactInstructions));
  const accountsHash = hashReferencedAccounts(
    remainingAccounts,
    compactInstructions
  );
  const preimage = new Uint8Array(
    EXECUTE_CHALLENGE_PREFIX.length + 32 + 32 + 32
  );
  let offset = 0;
  preimage.set(EXECUTE_CHALLENGE_PREFIX, offset);
  offset += EXECUTE_CHALLENGE_PREFIX.length;
  preimage.set(slotHash, offset);
  offset += 32;
  preimage.set(instructionsHash, offset);
  offset += 32;
  preimage.set(accountsHash, offset);
  return sha256(preimage);
}

/** SlotHashes + passkey challenge bound to the compact CPI payload. */
export function buildExecuteChallengeFromSlot(
  slot: SlotEntry,
  compactInstructions: readonly CompactInstructionArgs[],
  remainingAccounts: readonly (AccountMeta | Address)[]
): SlotChallenge {
  return {
    slotNumber: slot.slotNumber,
    messageHash: hashExecuteChallenge(
      slot.slotHash,
      compactInstructions,
      remainingAccounts
    ),
  };
}

function hashSetAuthorityChallenge(
  slotHash: Uint8Array,
  phygitalToken: Address,
  authority: Address
): Uint8Array {
  const tokenBytes = new Uint8Array(addressEncoder.encode(phygitalToken));
  const authorityBytes = new Uint8Array(addressEncoder.encode(authority));
  const preimage = new Uint8Array(
    SET_AUTHORITY_CHALLENGE_PREFIX.length +
      32 +
      tokenBytes.length +
      authorityBytes.length
  );
  let offset = 0;
  preimage.set(SET_AUTHORITY_CHALLENGE_PREFIX, offset);
  offset += SET_AUTHORITY_CHALLENGE_PREFIX.length;
  preimage.set(slotHash, offset);
  offset += 32;
  preimage.set(tokenBytes, offset);
  offset += tokenBytes.length;
  preimage.set(authorityBytes, offset);
  return sha256(preimage);
}

/** SlotHashes + passkey challenge bound to the authority pubkey. */
export async function buildSetAuthorityChallenge(
  rpc: Rpc<GetAccountInfoApi>,
  phygitalToken: Address,
  authority: Address
): Promise<SlotChallenge> {
  return withSlotChallenge(rpc, (slotHash) =>
    hashSetAuthorityChallenge(slotHash, phygitalToken, authority)
  );
}
