/**
 * Generate an ed25519 verifier keypair for local / custom token-verifier use.
 *
 * Prints:
 *   - publicKey (base58) — pass to set_token_verifier as `newVerifier`
 *   - VERIFIER_SECRET_KEY — put in .env
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { getBase58Decoder } from "@solana/kit";

const seed = ed25519.utils.randomSecretKey().slice(0, 32);
const publicKey = getBase58Decoder().decode(ed25519.getPublicKey(seed));
const secretBase58 = getBase58Decoder().decode(seed);

console.log(`VERIFIER_PUBLIC_KEY=${publicKey}`);
console.log(`VERIFIER_SECRET_KEY=${secretBase58}`);
console.log("");
console.log("Add VERIFIER_SECRET_KEY to examples/token-verifier/.env");
console.log(
  "On-chain: set_token_verifier(newVerifier=VERIFIER_PUBLIC_KEY, endpoint=https://…)",
);
