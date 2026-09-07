import type {
  Address,
  GetAccountInfoApi,
  Instruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import {
  fetchMaybeRecoveryWallet,
  findConfigPda,
  findRecoveryWalletAccountPda,
  findTokenVerifierPda,
  getClearRecoveryWalletInstruction,
  getSetRecoveryWalletInstruction,
} from "phygital-wallet-sdk";

import type { PasskeyAuth } from "@/lib/wallet/token-verifier";

/** Passkey verify + set_recovery_wallet (init or update recovery ed25519 key). */
export async function getSetRecoveryWalletInstructions(input: {
  /** Same signer instance as `sendTransaction` fee payer (`payer` + `verifier`). */
  verifier: TransactionSigner;
  recoveryWallet: Address;
  passkeyAuth: PasskeyAuth;
}): Promise<Instruction[]> {
  const phygitalToken = input.passkeyAuth.phygitalTokenPda;
  const [[configPda], [tokenVerifierPda], [recoveryWalletAccount]] =
    await Promise.all([
      findConfigPda(),
      findTokenVerifierPda({ phygitalToken }),
      findRecoveryWalletAccountPda({ phygitalToken }),
    ]);

  return [
    input.passkeyAuth.secp256r1VerifyInstruction,
    getSetRecoveryWalletInstruction({
      payer: input.verifier,
      verifier: input.verifier,
      config: configPda,
      phygitalToken,
      tokenVerifier: tokenVerifierPda,
      recoveryWalletAccount,
      recoveryWallet: input.recoveryWallet,
      secp256r1VerifyArgs: input.passkeyAuth.secp256r1VerifyArgs,
      slotNumber: input.passkeyAuth.slotNumber,
    }),
  ];
}

/** Passkey verify + clear_recovery_wallet (close PDA, refund rent). */
export async function getClearRecoveryWalletInstructions(input: {
  rpc: Rpc<GetAccountInfoApi>;
  /** Same signer instance as `sendTransaction` fee payer. */
  verifier: TransactionSigner;
  passkeyAuth: PasskeyAuth;
  /** Skip RPC when the recovery PDA payer is already known. */
  rentReceiver?: Address;
}): Promise<Instruction[]> {
  const phygitalToken = input.passkeyAuth.phygitalTokenPda;
  const [[configPda], [tokenVerifierPda], [recoveryWalletAccount]] =
    await Promise.all([
      findConfigPda(),
      findTokenVerifierPda({ phygitalToken }),
      findRecoveryWalletAccountPda({ phygitalToken }),
    ]);

  let rentReceiver = input.rentReceiver;
  if (!rentReceiver) {
    const account = await fetchMaybeRecoveryWallet(
      input.rpc,
      recoveryWalletAccount,
    );
    if (!account.exists) {
      throw new Error("Recovery wallet not found");
    }
    rentReceiver = account.data.payer;
  }

  return [
    input.passkeyAuth.secp256r1VerifyInstruction,
    getClearRecoveryWalletInstruction({
      verifier: input.verifier,
      config: configPda,
      phygitalToken,
      tokenVerifier: tokenVerifierPda,
      rentReceiver,
      recoveryWalletAccount,
      secp256r1VerifyArgs: input.passkeyAuth.secp256r1VerifyArgs,
      slotNumber: input.passkeyAuth.slotNumber,
    }),
  ];
}
