import type {
  Address,
  GetAccountInfoApi,
  Instruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import {
  assertHttpsEndpoint,
  fetchMaybeTokenVerifier,
  findConfigPda,
  findTokenVerifierPda,
  getClearTokenVerifierInstruction,
  getSetTokenVerifierInstruction,
  MAX_ENDPOINT_LEN,
  normalizeVerifierApiBase,
  type Secp256r1VerifyArgsArgs,
} from "phygital-wallet-sdk";

export type PasskeyAuth = {
  secp256r1VerifyInstruction: Instruction;
  phygitalTokenPda: Address;
  secp256r1VerifyArgs: Secp256r1VerifyArgsArgs;
  slotNumber: bigint;
};

/** Passkey verify + set_token_verifier (init or update token verifier override). */
export async function getSetTokenVerifierInstructions(input: {
  /** Same signer instance as `sendTransaction` fee payer (`payer` + `verifier`). */
  verifier: TransactionSigner;
  overrideVerifier: Address;
  endpoint: string;
  passkeyAuth: PasskeyAuth;
}): Promise<Instruction[]> {
  const endpoint = normalizeVerifierApiBase(
    assertHttpsEndpoint(input.endpoint, { maxLen: MAX_ENDPOINT_LEN }),
  );
  const phygitalToken = input.passkeyAuth.phygitalTokenPda;
  const [[configPda], [tokenVerifierPda]] = await Promise.all([
    findConfigPda(),
    findTokenVerifierPda({ phygitalToken }),
  ]);

  return [
    input.passkeyAuth.secp256r1VerifyInstruction,
    getSetTokenVerifierInstruction({
      payer: input.verifier,
      verifier: input.verifier,
      config: configPda,
      phygitalToken,
      tokenVerifier: tokenVerifierPda,
      newVerifier: input.overrideVerifier,
      endpoint,
      secp256r1VerifyArgs: input.passkeyAuth.secp256r1VerifyArgs,
      slotNumber: input.passkeyAuth.slotNumber,
    }),
  ];
}

/** Passkey verify + clear_token_verifier (close override PDA, refund rent). */
export async function getClearTokenVerifierInstructions(input: {
  rpc: Rpc<GetAccountInfoApi>;
  /** Same signer instance as `sendTransaction` fee payer. */
  verifier: TransactionSigner;
  passkeyAuth: PasskeyAuth;
  /** Skip RPC when the override payer is already known. */
  rentReceiver?: Address;
}): Promise<Instruction[]> {
  const phygitalToken = input.passkeyAuth.phygitalTokenPda;
  const [[configPda], [tokenVerifierPda]] = await Promise.all([
    findConfigPda(),
    findTokenVerifierPda({ phygitalToken }),
  ]);

  let rentReceiver = input.rentReceiver;
  if (!rentReceiver) {
    const tokenVerifierAccount = await fetchMaybeTokenVerifier(
      input.rpc,
      tokenVerifierPda,
    );
    if (!tokenVerifierAccount.exists) {
      throw new Error("Token verifier override not found");
    }
    rentReceiver = tokenVerifierAccount.data.payer;
  }

  return [
    input.passkeyAuth.secp256r1VerifyInstruction,
    getClearTokenVerifierInstruction({
      verifier: input.verifier,
      config: configPda,
      phygitalToken,
      rentReceiver,
      tokenVerifier: tokenVerifierPda,
      secp256r1VerifyArgs: input.passkeyAuth.secp256r1VerifyArgs,
      slotNumber: input.passkeyAuth.slotNumber,
    }),
  ];
}
