/**
 * Canonical config-change intent — the semantic identity of a wallet config
 * change, independent of the perishable owner passkey proof.
 *
 * The owner approves a config change by granting its **intent hash**. That hash
 * must cover only what the owner decided (which action, which new verifier /
 * endpoint / recovery wallet) and must NOT depend on the Secp256r1 signature or
 * `slotNumber`, which are produced *after* the grant when the tx is finally
 * built. So `/preview` (with a placeholder proof) and `/sign` (with the real
 * proof) parse to the same {@link ConfigIntent} and hash identically.
 *
 * Security rests on two checks at `/sign`, not on the hash alone:
 *  - the wire tx is strictly structured (only the config ix + its Secp256r1
 *    proof + Compute Budget — enforced in `decode-tx`), and
 *  - the config ix re-hashes to the granted intent (enforced in `authorizeIntent`).
 */
import type { Instruction } from "@solana/kit";
import {
  parsePhygitalWalletInstruction,
  PhygitalWalletInstruction,
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";

import { bytesToHex } from "@/verifier/intent-hash";

export type ConfigIntent =
  | {
      action: "set_token_verifier";
      phygitalToken: string;
      newVerifier: string;
      endpoint: string;
    }
  | { action: "clear_token_verifier"; phygitalToken: string }
  | {
      action: "set_recovery_wallet";
      phygitalToken: string;
      recoveryWallet: string;
    }
  | { action: "clear_recovery_wallet"; phygitalToken: string };

/**
 * Extract the {@link ConfigIntent} from a Phygital Wallet config instruction, or
 * null when `ix` is not one. Pure — unparseable data → null. Deliberately reads
 * only semantic fields; `secp256r1VerifyArgs` and `slotNumber` are ignored.
 */
export function parseConfigIntent(ix: Instruction): ConfigIntent | null {
  if (String(ix.programAddress) !== PHYGITAL_WALLET_PROGRAM_ADDRESS)
    return null;
  if (!ix.data?.length || !ix.accounts) return null;
  let parsed;
  try {
    parsed = parsePhygitalWalletInstruction(
      ix as Parameters<typeof parsePhygitalWalletInstruction>[0],
    );
  } catch {
    return null;
  }
  switch (parsed.instructionType) {
    case PhygitalWalletInstruction.SetTokenVerifier:
      return {
        action: "set_token_verifier",
        phygitalToken: String(parsed.accounts.phygitalToken.address),
        newVerifier: String(parsed.data.newVerifier),
        endpoint: parsed.data.endpoint,
      };
    case PhygitalWalletInstruction.ClearTokenVerifier:
      return {
        action: "clear_token_verifier",
        phygitalToken: String(parsed.accounts.phygitalToken.address),
      };
    case PhygitalWalletInstruction.SetRecoveryWallet:
      return {
        action: "set_recovery_wallet",
        phygitalToken: String(parsed.accounts.phygitalToken.address),
        recoveryWallet: String(parsed.data.recoveryWallet),
      };
    case PhygitalWalletInstruction.ClearRecoveryWallet:
      return {
        action: "clear_recovery_wallet",
        phygitalToken: String(parsed.accounts.phygitalToken.address),
      };
    default:
      return null;
  }
}

const CONFIG_INTENT_DOMAIN = "phygital-config-intent:v1";

/** Explicit, order-fixed serialization — no JSON key-order ambiguity. */
function canonicalConfigString(intent: ConfigIntent): string {
  switch (intent.action) {
    case "set_token_verifier":
      return `set_token_verifier|${intent.phygitalToken}|${intent.newVerifier}|${intent.endpoint}`;
    case "clear_token_verifier":
      return `clear_token_verifier|${intent.phygitalToken}`;
    case "set_recovery_wallet":
      return `set_recovery_wallet|${intent.phygitalToken}|${intent.recoveryWallet}`;
    case "clear_recovery_wallet":
      return `clear_recovery_wallet|${intent.phygitalToken}`;
  }
}

/**
 * Hash of the canonical config intent. Domain-separated from execute
 * `hashIntent`, so a config grant can never be consumed by an execute intent or
 * vice versa.
 */
export async function hashConfigIntent(intent: ConfigIntent): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${CONFIG_INTENT_DOMAIN}|${canonicalConfigString(intent)}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}
