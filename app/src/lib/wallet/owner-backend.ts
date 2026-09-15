/**
 * The owner ed25519 key is signed through the self-hosted secure-signer iframe
 * (see `secure-signer/`). This is the only owner backend; Helius WaaS was removed.
 *
 * NOTE: signing requires transaction v1 (live on mainnet). @solana/kit must emit
 * v1 wire transactions on the build side for the end-to-end path; create / import
 * / export flows do not depend on it.
 */
export const SECURE_SIGNER_ORIGIN: string =
  process.env.NEXT_PUBLIC_SECURE_SIGNER_ORIGIN?.trim() || "http://localhost:5173";
