import { getAddressEncoder, type Address } from "@solana/kit";
import type { IdentifierArray, WalletAccount } from "@wallet-standard/base";
import { SOLANA_CHAINS } from "@solana/wallet-standard-chains";
import {
  SolanaSignAndSendTransaction,
  SolanaSignMessage,
  SolanaSignTransaction,
} from "@solana/wallet-standard-features";

import { REVIBASE_WALLET_ICON } from "./icon.js";

const addressEncoder = getAddressEncoder();

const ACCOUNT_FEATURES = [
  SolanaSignAndSendTransaction,
  SolanaSignTransaction,
  SolanaSignMessage,
] as const;

export function createPhygitalWalletAccount(
  walletPda: Address,
  chains: IdentifierArray = SOLANA_CHAINS,
): WalletAccount {
  const publicKey = new Uint8Array(addressEncoder.encode(walletPda));
  return Object.freeze({
    address: String(walletPda),
    publicKey,
    chains: Object.freeze([...chains]) as IdentifierArray,
    features: Object.freeze([...ACCOUNT_FEATURES]) as IdentifierArray,
    label: "Revibase",
    icon: REVIBASE_WALLET_ICON,
  });
}
