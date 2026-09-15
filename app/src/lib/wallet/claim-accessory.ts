/**
 * Claim an accessory = on-chain `set_authority`, binding the physical accessory
 * to the signed-in owner wallet.
 *
 * The accessory passkey (NFC tap) authorizes the instruction; the Revibase
 * paymaster is the fee payer and co-signs via `/sign`. The owner wallet only
 * contributes its address (the new authority) — it does not sign.
 *
 * Slot-hash challenges expire quickly — fetch them on click via
 * `prepareClaimAccessory`, then `claimAccessory` (WebAuthn + send). Do not
 * prefetch the challenge.
 *
 * `set_authority` uses `init` (not `init_if_needed`), so this only works on an
 * unclaimed accessory. Re-owning requires `clear_authority` first.
 */
import { address, type Address } from "@solana/kit";
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

export type PreparedClaim = {
  phygitalToken: Address;
  owner: Address;
  slotNumber: bigint;
  messageHash: Uint8Array;
};

/** Fresh slot-hash challenge. Call on click — do not prefetch. */
export async function prepareClaimAccessory(args: {
  phygitalToken: string;
  ownerAddress: string;
}): Promise<PreparedClaim> {
  const rpc = getSolanaRpc();
  const phygitalToken = address(args.phygitalToken);
  const owner = address(args.ownerAddress);
  const { slotNumber, messageHash } = await buildSetAuthorityChallenge(
    rpc,
    phygitalToken,
    owner,
  );
  return { phygitalToken, owner, slotNumber, messageHash };
}

/**
 * Finish claim after `prepareClaimAccessory` in the same click handler.
 */
export async function claimAccessory(args: {
  prepared: PreparedClaim;
  /** Fires after the passkey tap is captured, before building/sending. */
  onTap?: () => void;
}): Promise<SentTransaction> {
  const rpc = getSolanaRpc();
  const { phygitalToken, owner, slotNumber, messageHash } = args.prepared;

  const tap = await authenticatePasskeyForSecp256r1Verify({ rpc, messageHash });
  args.onTap?.();

  const { secp256r1VerifyInstruction, secp256r1VerifyArgs, phygitalTokenPda } =
    await buildSecp256r1VerifyInstruction(tap);
  if (String(phygitalTokenPda) !== String(phygitalToken)) {
    throw new ClaimAccessoryMismatchError();
  }

  const feePayer = await createDefaultFeePayer({ fetch: appVerifierFetch });
  const setAuthorityIx = await getSetAuthorityInstructionAsync({
    payer: feePayer,
    phygitalToken,
    authority: owner,
    secp256r1VerifyArgs,
    slotNumber,
  });

  return sendTransaction({
    instructions: [secp256r1VerifyInstruction, setAuthorityIx],
    feePayer,
    fetchBlockhash: true,
    // Direct paymaster path (no wallet wrap) — v1 needs explicit CU / data limits.
    applyResourceLimits: true,
  });
}
