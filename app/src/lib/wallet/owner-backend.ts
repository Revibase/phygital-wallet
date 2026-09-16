/**
 * The owner ed25519 key is signed through the self-hosted secure-signer iframe
 * (see `secure-signer/`).
 *
 * Signing requires transaction v1. @solana/kit must emit v1 wire on the build
 * side for the end-to-end path; create / import / export do not depend on it.
 */
export const SECURE_SIGNER_ORIGIN: string =
  process.env.NEXT_PUBLIC_SECURE_SIGNER_ORIGIN?.trim() || "http://localhost:5173";
