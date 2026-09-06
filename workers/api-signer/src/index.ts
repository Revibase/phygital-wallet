/**
 * Private verifier signer Worker — TokenSigner Durable Object only.
 *
 * Owns: fee gate, authorizeIntent, ed25519 co-sign, policy/grants/owners.
 * Not publicly routed; callers use TOKEN_SIGNER DO binding from revibase-api.
 */
export { TokenSigner } from "./token-signer.js";

/** No public HTTP surface — use Durable Object RPC from api. */
export default {
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },
};
