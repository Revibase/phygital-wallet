/**
 * Resolve the on-chain phygital token PDA from a chip NFC `identifier` (`pk`).
 * The PDA is seeded by the on-chain passkey `publicKey`, not the identifier.
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
