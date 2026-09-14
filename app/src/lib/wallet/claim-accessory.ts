/**
 * Claim an accessory = on-chain `set_authority`, binding the physical accessory
 * to the signed-in owner (the Helius WaaS wallet).
 *
 * The accessory passkey (NFC tap) authorizes the instruction; the Revibase
 * paymaster is the fee payer and co-signs via `/sign`. The owner wallet only
 * contributes its address (the new authority) — it does not sign.
 *
 * `set_authority` uses `init` (not `init_if_needed`), so this only works on an
 * unclaimed accessory. Re-owning requires `clear_authority` first.
 */
import { address } from "@solana/kit";
import {
  authenticatePasskeyForSecp256r1Verify,
  buildSecp256r1VerifyInstruction,
} from "phygital-token-sdk";
import {
  buildSetAuthorityChallenge,
  createDefaultFeePayer,
  getSetAuthorityInstructionAsync,
} from "phygital-wallet-sdk";

import { getSolanaRpc } from "@/lib/solana/rpc";
import { sendTransaction, type SentTransaction } from "@/lib/solana/tx";
import { appVerifierFetch } from "@/lib/wallet/verifier-fee-payer";

export class ClaimAccessoryMismatchError extends Error {
  constructor() {
    super("The tapped accessory does not match this item");
    this.name = "ClaimAccessoryMismatchError";
  }
}

/**
 * Claim an unclaimed accessory for `ownerAddress` via a paymaster-sponsored
 * `set_authority`. Prompts the accessory tap, then submits through `/sign`.
 */
export async function claimAccessory(args: {
  phygitalToken: string;
  ownerAddress: string;
  /** Fires after the passkey tap is captured, before building/sending. */
  onTap?: () => void;
}): Promise<SentTransaction> {
  const rpc = getSolanaRpc();
  const phygitalToken = address(args.phygitalToken);
  const owner = address(args.ownerAddress);

  // Challenge bound to (token, new authority) — replay-safe via slot hash.
  const { slotNumber, messageHash } = await buildSetAuthorityChallenge(
    rpc,
    phygitalToken,
    owner
  );

  // Tap the accessory passkey over the challenge digest.
  const tap = await authenticatePasskeyForSecp256r1Verify({ rpc, messageHash });
  args.onTap?.();

  const { secp256r1VerifyInstruction, secp256r1VerifyArgs, phygitalTokenPda } =
    await buildSecp256r1VerifyInstruction(tap);
  if (String(phygitalTokenPda) !== String(phygitalToken)) {
    throw new ClaimAccessoryMismatchError();
  }

  // Paymaster is the fee payer + rent payer; it co-signs via /sign.
  const feePayer = await createDefaultFeePayer({ fetch: appVerifierFetch });
  const setAuthorityIx = await getSetAuthorityInstructionAsync({
    payer: feePayer,
    phygitalToken,
    authority: owner,
    secp256r1VerifyArgs,
    slotNumber,
  });

  // The secp256r1 verify precompile must immediately precede set_authority
  // (its `secp256r1VerifyArgs` reference it at relative index -1).
  return sendTransaction({
    instructions: [secp256r1VerifyInstruction, setAuthorityIx],
    feePayer,
    fetchBlockhash: true,
  });
}
