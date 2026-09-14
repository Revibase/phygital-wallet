/**
 * Private fee-payer Worker — TokenSigner Durable Object only.
 *
 * Owns fee-payer signing and per-token fee-balance accounting.
 * Not publicly routed; callers use TOKEN_SIGNER DO binding from revibase-api.
 */
export { TokenSigner } from "./token-signer.js";

/** No public HTTP surface — use Durable Object RPC from api. */
export default {
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },
};
