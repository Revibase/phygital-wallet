import type {
  Address,
  GetAccountInfoApi,
  Instruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";

import {
  getClearRecoveryWalletInstructions,
  getSetRecoveryWalletInstructions,
} from "@/lib/wallet/recovery-wallet";
import {
  getClearTokenVerifierInstructions,
  getSetTokenVerifierInstructions,
  type PasskeyAuth,
} from "@/lib/wallet/token-verifier";

/**
 * Proof-less config instructions for `/preview`.
 *
 * The signer only ever proves presence *after* the owner grants the change, so
 * before the grant we build the config instruction with a placeholder Secp256r1
 * proof and `slotNumber` 0. The verifier hashes only the canonical intent
 * (action + new verifier / endpoint / recovery wallet), which these placeholders
 * don't affect — so the preview hash equals the real, signed instruction's hash.
 * Only the wallet config instruction (`[1]`) is used; the placeholder proof
 * instruction (`[0]`) is discarded.
 */
function dummyPasskeyAuth(phygitalTokenPda: Address): PasskeyAuth {
  return {
    // programAddress is irrelevant — this instruction is never previewed/sent.
    secp256r1VerifyInstruction: {
      programAddress: phygitalTokenPda,
      data: new Uint8Array(),
      accounts: [],
    },
    phygitalTokenPda,
    secp256r1VerifyArgs: {
      verifyArgsRelativeIndex: 0,
      signedMessageIndex: 0,
      clientDataJson: new Uint8Array(),
    },
    slotNumber: 0n,
  };
}

export async function previewSetTokenVerifierInstruction(input: {
  verifier: TransactionSigner;
  overrideVerifier: Address;
  endpoint: string;
  phygitalTokenPda: Address;
}): Promise<Instruction> {
  const [, configIx] = await getSetTokenVerifierInstructions({
    verifier: input.verifier,
    overrideVerifier: input.overrideVerifier,
    endpoint: input.endpoint,
    passkeyAuth: dummyPasskeyAuth(input.phygitalTokenPda),
  });
  return configIx!;
}

export async function previewClearTokenVerifierInstruction(input: {
  rpc: Rpc<GetAccountInfoApi>;
  verifier: TransactionSigner;
  phygitalTokenPda: Address;
  rentReceiver?: Address;
}): Promise<Instruction> {
  const [, configIx] = await getClearTokenVerifierInstructions({
    rpc: input.rpc,
    verifier: input.verifier,
    passkeyAuth: dummyPasskeyAuth(input.phygitalTokenPda),
    // Excluded from the intent hash; pass the token PDA to skip the RPC lookup.
    rentReceiver: input.rentReceiver ?? input.phygitalTokenPda,
  });
  return configIx!;
}

export async function previewSetRecoveryWalletInstruction(input: {
  verifier: TransactionSigner;
  recoveryWallet: Address;
  phygitalTokenPda: Address;
}): Promise<Instruction> {
  const [, configIx] = await getSetRecoveryWalletInstructions({
    verifier: input.verifier,
    recoveryWallet: input.recoveryWallet,
    passkeyAuth: dummyPasskeyAuth(input.phygitalTokenPda),
  });
  return configIx!;
}

export async function previewClearRecoveryWalletInstruction(input: {
  rpc: Rpc<GetAccountInfoApi>;
  verifier: TransactionSigner;
  phygitalTokenPda: Address;
  rentReceiver?: Address;
}): Promise<Instruction> {
  const [, configIx] = await getClearRecoveryWalletInstructions({
    rpc: input.rpc,
    verifier: input.verifier,
    passkeyAuth: dummyPasskeyAuth(input.phygitalTokenPda),
    rentReceiver: input.rentReceiver ?? input.phygitalTokenPda,
  });
  return configIx!;
}
