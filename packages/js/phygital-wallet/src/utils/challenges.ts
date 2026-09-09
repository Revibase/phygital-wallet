import {
  getAddressEncoder,
  getBase64Encoder,
  getU64Decoder,
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
  "phygital_wallet:execute:v2",
);
const SET_TOKEN_VERIFIER_CHALLENGE_PREFIX = new TextEncoder().encode(
  "phygital_wallet:set_tv:v1",
);
const CLEAR_TOKEN_VERIFIER_CHALLENGE_PREFIX = new TextEncoder().encode(
  "phygital_wallet:clear_tv:v1",
);
const SET_RECOVERY_WALLET_CHALLENGE_PREFIX = new TextEncoder().encode(
  "phygital_wallet:set_rw:v1",
);
const CLEAR_RECOVERY_WALLET_CHALLENGE_PREFIX = new TextEncoder().encode(
  "phygital_wallet:clear_rw:v1",
);

type SlotChallenge = {
  slotNumber: bigint;
  messageHash: Uint8Array;
};

export type SlotEntry = {
  slotNumber: bigint;
  slotHash: Uint8Array;
};

export async function fetchLatestSlothHash(
  rpc: Rpc<GetAccountInfoApi>,
): Promise<SlotEntry> {
  const { value } = await rpc
    .getAccountInfo(slotHashesAddress, {
      encoding: "base64",
      commitment: "confirmed",
      dataSlice: { offset: 8, length: 40 },
    })
    .send();

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
  hashMessage: (slotHash: Uint8Array) => Uint8Array,
): Promise<SlotChallenge> {
  const { slotNumber, slotHash } = await fetchLatestSlothHash(rpc);
  return { slotNumber, messageHash: hashMessage(slotHash) };
}

/**
 * Packed compact format for `instructions_hash`:
 * `[num][progIdx][nAcc][indexes...][dataLen LE u16][data...]...`
 */
export function packCompactInstructions(
  instructions: readonly CompactInstructionArgs[],
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

export function hashReferencedAccounts(
  remainingKeys: readonly Address[],
  instructions: readonly CompactInstructionArgs[],
): Uint8Array {
  const encoded = new Map<Address, Uint8Array>();
  const encode = (key: Address) => {
    let bytes = encoded.get(key);
    if (!bytes) {
      bytes = new Uint8Array(addressEncoder.encode(key));
      encoded.set(key, bytes);
    }
    return bytes;
  };

  const parts: Uint8Array[] = [];
  let total = 0;

  for (const ix of instructions) {
    const program = remainingKeys[ix.programIdIndex];
    if (program === undefined) {
      throw new Error(`Invalid program_id_index ${ix.programIdIndex}`);
    }
    const programBytes = encode(program);
    parts.push(programBytes);
    total += programBytes.length;

    for (const idx of ix.accountIndexes) {
      const key = remainingKeys[idx];
      if (key === undefined) {
        throw new Error(`Invalid account index ${idx}`);
      }
      const keyBytes = encode(key);
      parts.push(keyBytes);
      total += keyBytes.length;
    }
  }

  const buf = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    buf.set(part, offset);
    offset += part.length;
  }
  return sha256(buf);
}

export function hashExecuteChallenge(
  slotHash: Uint8Array,
  compactInstructions: readonly CompactInstructionArgs[],
  remainingKeys: readonly Address[],
): Uint8Array {
  const instructionsHash = sha256(packCompactInstructions(compactInstructions));
  const accountsHash = hashReferencedAccounts(
    remainingKeys,
    compactInstructions,
  );
  const preimage = new Uint8Array(
    EXECUTE_CHALLENGE_PREFIX.length + 32 + 32 + 32,
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

function hashSetTokenVerifierChallenge(
  slotHash: Uint8Array,
  phygitalToken: Address,
  verifier: Address,
  endpoint: string,
): Uint8Array {
  const tokenBytes = new Uint8Array(addressEncoder.encode(phygitalToken));
  const verifierBytes = new Uint8Array(addressEncoder.encode(verifier));
  const endpointBytes = new TextEncoder().encode(endpoint);
  const preimage = new Uint8Array(
    SET_TOKEN_VERIFIER_CHALLENGE_PREFIX.length +
      32 +
      tokenBytes.length +
      verifierBytes.length +
      endpointBytes.length,
  );
  let offset = 0;
  preimage.set(SET_TOKEN_VERIFIER_CHALLENGE_PREFIX, offset);
  offset += SET_TOKEN_VERIFIER_CHALLENGE_PREFIX.length;
  preimage.set(slotHash, offset);
  offset += 32;
  preimage.set(tokenBytes, offset);
  offset += tokenBytes.length;
  preimage.set(verifierBytes, offset);
  offset += verifierBytes.length;
  preimage.set(endpointBytes, offset);
  return sha256(preimage);
}

function hashClearTokenVerifierChallenge(
  slotHash: Uint8Array,
  phygitalToken: Address,
): Uint8Array {
  const tokenBytes = new Uint8Array(addressEncoder.encode(phygitalToken));
  const preimage = new Uint8Array(
    CLEAR_TOKEN_VERIFIER_CHALLENGE_PREFIX.length + 32 + tokenBytes.length,
  );
  let offset = 0;
  preimage.set(CLEAR_TOKEN_VERIFIER_CHALLENGE_PREFIX, offset);
  offset += CLEAR_TOKEN_VERIFIER_CHALLENGE_PREFIX.length;
  preimage.set(slotHash, offset);
  offset += 32;
  preimage.set(tokenBytes, offset);
  return sha256(preimage);
}

/** SlotHashes + passkey challenge bound to the compact CPI payload. */
export function buildExecuteChallengeFromSlot(
  slot: SlotEntry,
  compactInstructions: readonly CompactInstructionArgs[],
  remainingKeys: readonly Address[],
): SlotChallenge {
  return {
    slotNumber: slot.slotNumber,
    messageHash: hashExecuteChallenge(
      slot.slotHash,
      compactInstructions,
      remainingKeys,
    ),
  };
}

export async function buildSetTokenVerifierChallenge(
  rpc: Rpc<GetAccountInfoApi>,
  phygitalToken: Address,
  verifier: Address,
  endpoint: string,
): Promise<SlotChallenge> {
  return withSlotChallenge(rpc, (slotHash) =>
    hashSetTokenVerifierChallenge(slotHash, phygitalToken, verifier, endpoint),
  );
}

export async function buildClearTokenVerifierChallenge(
  rpc: Rpc<GetAccountInfoApi>,
  phygitalToken: Address,
): Promise<SlotChallenge> {
  return withSlotChallenge(rpc, (slotHash) =>
    hashClearTokenVerifierChallenge(slotHash, phygitalToken),
  );
}

function hashSetRecoveryWalletChallenge(
  slotHash: Uint8Array,
  phygitalToken: Address,
  recoveryWallet: Address,
): Uint8Array {
  const tokenBytes = new Uint8Array(addressEncoder.encode(phygitalToken));
  const recoveryBytes = new Uint8Array(addressEncoder.encode(recoveryWallet));
  const preimage = new Uint8Array(
    SET_RECOVERY_WALLET_CHALLENGE_PREFIX.length +
      32 +
      tokenBytes.length +
      recoveryBytes.length,
  );
  let offset = 0;
  preimage.set(SET_RECOVERY_WALLET_CHALLENGE_PREFIX, offset);
  offset += SET_RECOVERY_WALLET_CHALLENGE_PREFIX.length;
  preimage.set(slotHash, offset);
  offset += 32;
  preimage.set(tokenBytes, offset);
  offset += tokenBytes.length;
  preimage.set(recoveryBytes, offset);
  return sha256(preimage);
}

function hashClearRecoveryWalletChallenge(
  slotHash: Uint8Array,
  phygitalToken: Address,
): Uint8Array {
  const tokenBytes = new Uint8Array(addressEncoder.encode(phygitalToken));
  const preimage = new Uint8Array(
    CLEAR_RECOVERY_WALLET_CHALLENGE_PREFIX.length + 32 + tokenBytes.length,
  );
  let offset = 0;
  preimage.set(CLEAR_RECOVERY_WALLET_CHALLENGE_PREFIX, offset);
  offset += CLEAR_RECOVERY_WALLET_CHALLENGE_PREFIX.length;
  preimage.set(slotHash, offset);
  offset += 32;
  preimage.set(tokenBytes, offset);
  return sha256(preimage);
}

/** SlotHashes + passkey challenge bound to the recovery wallet pubkey. */
export async function buildSetRecoveryWalletChallenge(
  rpc: Rpc<GetAccountInfoApi>,
  phygitalToken: Address,
  recoveryWallet: Address,
): Promise<SlotChallenge> {
  return withSlotChallenge(rpc, (slotHash) =>
    hashSetRecoveryWalletChallenge(slotHash, phygitalToken, recoveryWallet),
  );
}

export async function buildClearRecoveryWalletChallenge(
  rpc: Rpc<GetAccountInfoApi>,
  phygitalToken: Address,
): Promise<SlotChallenge> {
  return withSlotChallenge(rpc, (slotHash) =>
    hashClearRecoveryWalletChallenge(slotHash, phygitalToken),
  );
}
