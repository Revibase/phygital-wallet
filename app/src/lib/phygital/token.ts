import {
  address,
  type Address,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import {
  fetchMaybePhygitalToken,
  fetchPhygitalToken as fetchPhygitalTokenAccount,
  fetchPhygitalTokenByIdentifier as fetchPhygitalTokenAccountByIdentifier,
  findPhygitalTokenPda,
  PhygitalTokenType,
  type PhygitalToken as PhygitalTokenAccount,
} from "phygital-token-sdk";

import { bytesToBase64Url } from "@/lib/crypto/base64";

/** System program / default pubkey — token.owner before first claim. */
export const DEFAULT_TOKEN_OWNER = address("11111111111111111111111111111111");

/** Lean view of an on-chain phygital token (ownership-only). */
export type PhygitalToken = {
  tokenType: PhygitalTokenType;
  identifier: string;
  secp256r1PublicKey: string;
  /** On-chain token PDA. */
  address: Address;
  isLocked: boolean;
  currentOwner: Address;
  lastSignCount: number;
  mint: Address;
};

export function phygitalTokenFromAccount(
  tokenAddress: Address,
  account: PhygitalTokenAccount,
): PhygitalToken {
  return {
    tokenType: account.tokenType as PhygitalTokenType,
    identifier: bytesToBase64Url(new Uint8Array(account.identifier[0])),
    secp256r1PublicKey: bytesToBase64Url(new Uint8Array(account.publicKey[0])),
    address: tokenAddress,
    isLocked: account.isLocked !== 0,
    currentOwner: account.owner,
    lastSignCount: account.lastSignCount,
    mint: account.mint,
  };
}

/** Load token by on-chain PDA. */
export async function fetchPhygitalToken(
  rpc: Rpc<SolanaRpcApi>,
  tokenAddress: Address,
): Promise<PhygitalToken> {
  const { data } = await fetchPhygitalTokenAccount(rpc, tokenAddress);
  return phygitalTokenFromAccount(tokenAddress, data);
}

/**
 * Load token by passkey public key (WebAuthn `verifyResponse` result).
 * PDA is seeded by the passkey, not the chip identifier. `null` when the
 * account does not exist yet.
 */
export async function fetchMaybePhygitalTokenByPasskey(
  rpc: Rpc<SolanaRpcApi>,
  secp256r1PublicKey: string,
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
  identifier: string,
): Promise<PhygitalToken> {
  const account = await fetchPhygitalTokenAccountByIdentifier(rpc, identifier);
  if (!account) {
    throw new Error("Token not found for identifier");
  }
  const tokenAddress = await findPhygitalTokenPda(account.publicKey);
  return phygitalTokenFromAccount(tokenAddress, account);
}

/**
 * True when on-chain `mint` is set (not `Pubkey::default()` / system program).
 * Unset mint is the same sentinel as unclaimed `owner`.
 */
export function tokenHasLinkedMint(
  token: Pick<PhygitalToken, "mint">,
): boolean {
  return token.mint !== DEFAULT_TOKEN_OWNER;
}
