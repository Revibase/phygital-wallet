import {
  type Address,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import {
  fetchAllMaybePhygitalToken,
  fetchMaybePhygitalToken,
  fetchPhygitalToken as fetchPhygitalTokenAccount,
  fetchPhygitalTokenByIdentifier as fetchPhygitalTokenAccountByIdentifier,
  findPhygitalTokenPda,
  PhygitalTokenType,
  type PhygitalToken as PhygitalTokenAccount,
} from "phygital-token-sdk";

import { bytesToBase64Url } from "@/lib/crypto/base64";

/** Lean view of an on-chain phygital token (ownership-only; mint ignored). */
export type PhygitalToken = {
  tokenType: PhygitalTokenType;
  identifier: string;
  secp256r1PublicKey: string;
  address: Address;
  isLocked: boolean;
  owner: Address;
  lastSignCount: number;
};

export function phygitalTokenFromAccount(
  tokenAddress: Address,
  account: PhygitalTokenAccount
): PhygitalToken {
  return {
    tokenType: account.tokenType as PhygitalTokenType,
    identifier: bytesToBase64Url(new Uint8Array(account.identifier[0])),
    secp256r1PublicKey: bytesToBase64Url(new Uint8Array(account.publicKey[0])),
    address: tokenAddress,
    isLocked: account.isLocked !== 0,
    owner: account.owner,
    lastSignCount: account.lastSignCount,
  };
}

export async function fetchPhygitalToken(
  rpc: Rpc<SolanaRpcApi>,
  tokenAddress: Address
): Promise<PhygitalToken> {
  const { data } = await fetchPhygitalTokenAccount(rpc, tokenAddress);
  return phygitalTokenFromAccount(tokenAddress, data);
}

/**
 * Batch-load phygital tokens by PDA (`getMultipleAccounts`). Missing accounts
 * are omitted from the map.
 */
export async function fetchPhygitalTokensByAddresses(
  rpc: Rpc<SolanaRpcApi>,
  tokenAddresses: readonly Address[],
): Promise<Map<string, PhygitalToken>> {
  const out = new Map<string, PhygitalToken>();
  if (tokenAddresses.length === 0) return out;
  const accounts = await fetchAllMaybePhygitalToken(rpc, [...tokenAddresses]);
  for (let i = 0; i < tokenAddresses.length; i++) {
    const maybe = accounts[i];
    const tokenAddress = tokenAddresses[i]!;
    if (!maybe?.exists) continue;
    out.set(
      String(tokenAddress),
      phygitalTokenFromAccount(tokenAddress, maybe.data),
    );
  }
  return out;
}

/**
 * Load token by passkey public key (WebAuthn `verifyResponse` result).
 * PDA is seeded by the passkey, not the chip identifier. `null` when the
 * account does not exist yet.
 */
export async function fetchMaybePhygitalTokenByPasskey(
  rpc: Rpc<SolanaRpcApi>,
  secp256r1PublicKey: string
): Promise<PhygitalToken | null> {
  const tokenAddress = await findPhygitalTokenPda(secp256r1PublicKey);
  const account = await fetchMaybePhygitalToken(rpc, tokenAddress);
  if (!account.exists) return null;
  return phygitalTokenFromAccount(tokenAddress, account.data);
}

/**
 * Load token by chip `identifier` (NFC URL `pk`), not by passkey.
 * PDA is still derived from on-chain `publicKey` after the GPA lookup.
 */
export async function fetchPhygitalTokenByIdentifier(
  rpc: Rpc<SolanaRpcApi>,
  identifier: string
): Promise<PhygitalToken> {
  const account = await fetchPhygitalTokenAccountByIdentifier(rpc, identifier);
  if (!account) {
    throw new Error("Token not found for identifier");
  }
  const tokenAddress = await findPhygitalTokenPda(account.publicKey);
  return phygitalTokenFromAccount(tokenAddress, account);
}
