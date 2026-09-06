/**
 * Resolve on-chain phygital token PDA from chip NFC `identifier` (`pk`).
 */
import { createSolanaRpc } from "@solana/kit";
import {
  fetchPhygitalTokenByIdentifier,
  findPhygitalTokenPda,
} from "phygital-token-sdk";

import { getRpcUrl } from "@/shared/solana/cluster";

export async function resolvePhygitalTokenFromIdentifier(
  identifier: string,
): Promise<string | null> {
  try {
    const rpc = createSolanaRpc(getRpcUrl());
    const account = await fetchPhygitalTokenByIdentifier(rpc, identifier);
    if (!account) return null;
    return String(await findPhygitalTokenPda(account.publicKey));
  } catch {
    return null;
  }
}
