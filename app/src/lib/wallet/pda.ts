import { address, type Address } from "@solana/kit";
import { findWalletPda } from "phygital-wallet-sdk";

/** Derive the phygital-wallet PDA for a phygital token account. */
export async function walletPdaForToken(
  phygitalToken: Address | string
): Promise<Address> {
  const [wallet] = await findWalletPda({
    phygitalToken: address(String(phygitalToken)),
  });
  return wallet;
}
