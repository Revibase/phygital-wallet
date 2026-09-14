import { registerWallet } from "@wallet-standard/wallet";

import { PhygitalWallet, type PhygitalWalletOptions } from "./wallet.js";

const registered = new WeakSet<object>();

/**
 * Register Revibase as a Wallet Standard wallet so Standard-aware Solana
 * connectors (e.g. `@solana/connectors`) can discover it.
 *
 * Call once at app startup, before mounting any Wallet Standard consumer.
 *
 * On `standard:connect`, authenticates the accessory, verifies the response
 * locally, derives its phygital token and wallet PDAs, and exposes the wallet
 * PDA as the connected account. The PDA pair is persisted so a prior session
 * can be restored without another tap.
 *
 * Idempotent per `rpc` instance in this JS realm.
 */
export function registerPhygitalWallet(options: PhygitalWalletOptions): void {
  if (registered.has(options.rpc)) return;
  registerWallet(new PhygitalWallet(options));
  registered.add(options.rpc);
}

export type { PhygitalWalletOptions };
