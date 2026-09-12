import { ed25519 } from "@noble/curves/ed25519.js";
import { describe, expect, it } from "vitest";

import { signVerifierBearer, verifyVerifierBearer } from "./bearer.js";

const SUB = "So11111111111111111111111111111111111111112";

function keypair() {
  const secretKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(secretKey);
  // Stand-in for a base58 address — bearer verification compares iss as an
  // opaque string, so any stable label paired with the pubkey works here.
  const address = `verifier-${Buffer.from(publicKey)
    .toString("hex")
    .slice(0, 8)}`;
  const sign = (message: Uint8Array) => ed25519.sign(message, secretKey);
  decodableKeys.set(address, publicKey);
  return { secretKey, publicKey, address, sign };
}

type Keypair = ReturnType<typeof keypair>;

/**
 * Mirror the worker's two callbacks: a pure address→key decode (any well-formed
 * address decodes), and the on-chain membership test over this token's
 * authorized set (as Config.verifiers would be). Decoding and authorization are
 * deliberately separate so tests can exercise each rejection path on its own.
 *
 * `authorizeCalls` lets tests assert the chain is never consulted for a bearer
 * that fails a pure check.
 */
function verifyOpts(...authorized: Keypair[]) {
  const state = { authorizeCalls: 0 };
  return {
    state,
    opts: {
      decodeVerifierKey: (iss: string) => decodableKeys.get(iss) ?? null,
      isAuthorizedVerifier: async ({ iss }: { sub: string; iss: string }) => {
        state.authorizeCalls++;
        return authorized.some((v) => v.address === iss);
      },
    },
  };
}

/** Every address minted by `keypair()` is decodable, authorized or not. */
const decodableKeys = new Map<string, Uint8Array>();

describe("verifier bearer", () => {
  it("round-trips: a freshly signed bearer verifies", async () => {
    const v = keypair();
    const { accessToken, expiresAt } = await signVerifierBearer(
      { sub: SUB, iss: v.address, origin: null, ttlMs: 900_000 },
      v.sign,
    );
    expect(expiresAt).toBeGreaterThan(Date.now());

    const payload = await verifyVerifierBearer(accessToken, {
      ...verifyOpts(v).opts,
    });
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe(SUB);
    expect(payload!.iss).toBe(v.address);
  });

  // A token on the Config defaults accepts ANY active verifier, and
  // resolveVerifier picks one at random — so membership, not equality.
  it("accepts any verifier in the authorized set (Config defaults)", async () => {
    const a = keypair();
    const b = keypair();
    const c = keypair();
    for (const signer of [a, b, c]) {
      const { accessToken } = await signVerifierBearer(
        { sub: SUB, iss: signer.address, origin: null, ttlMs: 900_000 },
        signer.sign,
      );
      const payload = await verifyVerifierBearer(accessToken, {
        ...verifyOpts(a, b, c).opts,
      });
      expect(payload?.iss).toBe(signer.address);
    }
  });

  it("rejects a wrong signing key", async () => {
    const issuer = keypair();
    const attacker = keypair();
    const { accessToken } = await signVerifierBearer(
      { sub: SUB, iss: issuer.address, origin: null, ttlMs: 900_000 },
      attacker.sign, // signed by someone other than iss
    );
    const payload = await verifyVerifierBearer(accessToken, {
      ...verifyOpts(issuer).opts,
    });
    expect(payload).toBeNull();
  });

  // Properly signed by a real key, but that key is not authorized for this
  // token — so only the on-chain membership check can reject it.
  it("rejects when iss is not an authorized verifier for the token", async () => {
    const v = keypair();
    const { accessToken } = await signVerifierBearer(
      { sub: SUB, iss: v.address, origin: null, ttlMs: 900_000 },
      v.sign,
    );
    const other = keypair();
    const { state, opts } = verifyOpts(other);
    expect(await verifyVerifierBearer(accessToken, opts)).toBeNull();
    expect(state.authorizeCalls).toBe(1);
  });

  // Ordering guarantee: a forged bearer must cost no on-chain lookup, so these
  // open endpoints cannot be used to amplify RPC load.
  it("never consults the chain for a bad signature or expiry", async () => {
    const v = keypair();
    const attacker = keypair();

    const forged = await signVerifierBearer(
      { sub: SUB, iss: v.address, origin: null, ttlMs: 900_000 },
      attacker.sign,
    );
    const forgedOpts = verifyOpts(v);
    expect(
      await verifyVerifierBearer(forged.accessToken, forgedOpts.opts),
    ).toBeNull();
    expect(forgedOpts.state.authorizeCalls).toBe(0);

    const stale = await signVerifierBearer(
      { sub: SUB, iss: v.address, origin: null, ttlMs: 1_000 },
      v.sign,
      Date.now() - 10_000,
    );
    const staleOpts = verifyOpts(v);
    expect(
      await verifyVerifierBearer(stale.accessToken, staleOpts.opts),
    ).toBeNull();
    expect(staleOpts.state.authorizeCalls).toBe(0);
  });

  it("rejects a tampered payload", async () => {
    const v = keypair();
    const { accessToken } = await signVerifierBearer(
      { sub: SUB, iss: v.address, origin: null, ttlMs: 900_000 },
      v.sign,
    );
    const [, sig] = accessToken.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        sub: "bad",
        iss: v.address,
        exp: Date.now() + 1e6,
        jti: "x",
      }),
    ).toString("base64url");
    const tampered = `${forgedPayload}.${sig}`;
    const payload = await verifyVerifierBearer(tampered, {
      ...verifyOpts(v).opts,
    });
    expect(payload).toBeNull();
  });

  it("rejects an expired bearer", async () => {
    const v = keypair();
    const past = Date.now() - 10_000;
    const { accessToken } = await signVerifierBearer(
      { sub: SUB, iss: v.address, origin: null, ttlMs: 1_000 },
      v.sign,
      past, // minted in the past so it is already expired
    );
    const payload = await verifyVerifierBearer(accessToken, {
      ...verifyOpts(v).opts,
    });
    expect(payload).toBeNull();
  });
});
