import { address, type Address } from "@solana/kit";
import { findWalletPda } from "phygital-wallet-sdk";

export async function walletPdaForToken(
  phygitalToken: Address | string
): Promise<Address> {
  const [wallet] = await findWalletPda({
    phygitalToken: address(String(phygitalToken)),
  });
  return wallet;
}
