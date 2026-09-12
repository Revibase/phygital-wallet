import { address, type Address } from "@solana/kit";

import { authenticateToken } from "@/lib/token/authenticate";
import {
  fetchMaybePhygitalTokenByPasskey,
  type PhygitalToken,
} from "@/lib/phygital/token";
import { getSolanaRpc } from "@/lib/solana/rpc";
import { walletPdaForToken } from "@/lib/wallet/pda";

type IdentifiedAccessory = {
  token: PhygitalToken;
  walletPda: Address;
};

/**
 * NFC identify — resolve the held accessory's phygital token + wallet PDA.
 * Optional `expectedWallet` rejects a different accessory (settle mismatch).
 */
export async function identifyAccessory(args?: {
  expectedWallet?: Address | string;
  onPasskeyComplete?: () => void;
}): Promise<IdentifiedAccessory> {
  const { secp256r1PublicKey } = await authenticateToken({
    onPasskeyComplete: args?.onPasskeyComplete,
  });
  const token = await fetchMaybePhygitalTokenByPasskey(
    getSolanaRpc(),
    secp256r1PublicKey,
  );
  if (!token) {
    throw new Error("Couldn’t read accessory — try again.");
  }
  const walletPda = await walletPdaForToken(token.address);
  if (
    args?.expectedWallet &&
    String(walletPda) !== String(args.expectedWallet)
  ) {
    throw new Error("That isn’t the linked accessory");
  }
  return { token, walletPda: address(String(walletPda)) };
}
