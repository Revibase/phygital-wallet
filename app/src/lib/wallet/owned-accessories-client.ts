import { address } from "@solana/kit";
import { fetchPhygitalTokensByAuthority } from "phygital-wallet-sdk";

import { getSolanaRpc } from "@/lib/solana/rpc";

/**
 * Every accessory this ed25519 authority controls — thin app wrapper around
 * SDK `fetchPhygitalTokensByAuthority`.
 */
export async function fetchOwnedAccessories(
  authority: string,
): Promise<string[]> {
  const tokens = await fetchPhygitalTokensByAuthority(
    getSolanaRpc(),
    address(authority),
  );
  return tokens.map(String);
}
