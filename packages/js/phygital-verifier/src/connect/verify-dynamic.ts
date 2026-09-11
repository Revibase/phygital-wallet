/**
 * `verifyDynamicConnectProof` — the dynamic-URL (NFC tap) check a verifier runs
 * on `POST /connect/tap`. Symmetric with {@link verifyConnectProof} so a verifier
 * implements both connect endpoints in a few lines.
 *
 * Every verifier must support this: when a token configured to it is entered via
 * an NFC URL, only *that* verifier's signature is accepted on its own
 * `/preview`·`/sign`, so only it can mint the usable bearer.
 *
 * The chip signs `counter ‖ nonce` with no slot or timestamp, so freshness comes
 * solely from the monotonic counter. That is stateful, so the verifier injects
 * `consumeCounter` backed by its own per-chip high-water store.
 *
 * Order is deliberate: the pure signature check runs before any RPC or store
 * access, so unsigned traffic cannot drive load.
 */
import {
  fetchPhygitalTokenByIdentifier,
  findPhygitalTokenPda,
} from "phygital-token-sdk";
import type { Address, Rpc, SolanaRpcApi } from "@solana/kit";

import { ConnectProofError } from "./proof-error.js";
import { verifyDynamicTap, type DynamicTapParams } from "./dynamic-url.js";

/**
 * Advance this verifier's per-chip counter high-water.
 * Return `true` when `counter` is strictly newer than what is stored (and the
 * store has been advanced), `false` to reject as a replay.
 */
export type ConsumeTapCounter = (args: {
  identifier: string;
  counter: number;
  phygitalToken: Address;
}) => Promise<boolean> | boolean;

export async function verifyDynamicConnectProof(
  proof: DynamicTapParams,
  opts: {
    /** Needed only when `phygitalToken` is omitted (to resolve it from `pk`). */
    rpc?: Rpc<SolanaRpcApi>;
    consumeCounter: ConsumeTapCounter;
    /**
     * Token already resolved for this chip identifier. A caller that resolved it
     * to route the request (e.g. to a per-token store) passes it here to skip a
     * second `getProgramAccounts` scan — the most expensive call in this flow.
     * Omit it for the self-contained default.
     */
    phygitalToken?: Address;
  },
): Promise<{
  phygitalToken: Address;
  identifier: string;
  counter: number;
}> {
  // 1. Pure signature check — no IO.
  let tap: ReturnType<typeof verifyDynamicTap>;
  try {
    tap = verifyDynamicTap(proof);
  } catch (err) {
    throw new ConnectProofError(
      "invalid_proof",
      err instanceof Error ? err.message : "Invalid tap parameters",
    );
  }
  if (!tap.isVerified) {
    throw new ConnectProofError("invalid_signature", "Invalid tap signature");
  }

  // 2. Resolve the token from the chip identifier (on-chain truth), unless the
  //    caller already did so to route here.
  let phygitalToken = opts.phygitalToken;
  if (!phygitalToken) {
    if (!opts.rpc) {
      throw new ConnectProofError(
        "invalid_proof",
        "rpc is required when phygitalToken is not provided",
      );
    }
    const account = await fetchPhygitalTokenByIdentifier(
      opts.rpc,
      tap.identifier,
    );
    if (!account) {
      throw new ConnectProofError(
        "token_not_found",
        "No phygital token for this accessory",
      );
    }
    phygitalToken = await findPhygitalTokenPda(account.publicKey);
  }

  // 3. Monotonic counter — the only replay defence for a dynamic tap.
  const fresh = await opts.consumeCounter({
    identifier: tap.identifier,
    counter: tap.counter,
    phygitalToken,
  });
  if (!fresh) {
    throw new ConnectProofError(
      "tap_replay",
      "This tap timed out. Hold your item here again to verify.",
    );
  }

  return { phygitalToken, identifier: tap.identifier, counter: tap.counter };
}
