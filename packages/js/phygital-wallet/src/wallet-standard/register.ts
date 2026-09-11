import { registerWallet } from "@wallet-standard/wallet";

import { PhygitalWallet, type PhygitalWalletOptions } from "./wallet.js";

const registered = new WeakSet<RpcLike>();

type RpcLike = PhygitalWalletOptions["rpc"];

/**
 * Register Revibase as a Wallet Standard wallet so Standard-aware Solana
 * connectors (e.g. `@solana/connectors`) can discover it.
 *
 * Call once at app startup, before mounting any Wallet Standard consumer.
 *
 * On `standard:connect`, uses `connectPhygitalWallet` to prompt an NFC/passkey
 * tap, issue a verifier bearer, and expose the wallet PDA as the connected
 * account. The bearer and its expiry are persisted so a prior session can be
 * restored without another tap until renewal is needed.
 *
 * Idempotent per `rpc` instance in this JS realm.
 */
export function registerPhygitalWallet(options: PhygitalWalletOptions): void {
  if (registered.has(options.rpc)) {
    return;
  }
  registerWallet(new PhygitalWallet(options));
  registered.add(options.rpc);
}

export type { PhygitalWalletOptions };
