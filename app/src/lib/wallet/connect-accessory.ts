/**
 * Hold-to-unlock via WebAuthn — prove control of the accessory passkey, then
 * let the api worker issue the `browse_unlock` cookie.
 *
 *   POST /accessory/unlock/challenge → startAuthentication(challenge)
 *     → POST /accessory/unlock/webauthn → browse-unlock cookie
 *
 * The api worker verifies the assertion server-side and resolves the token PDA;
 * we only enforce that the resolved token matches the one the route expected.
 */
import { startAuthentication } from "phygital-token-sdk";

import { queryFetch, readJson } from "@/lib/queries/http";
import { getSolanaRpc } from "@/lib/solana/rpc";

export class AccessoryMismatchError extends Error {
  constructor() {
    super("The tapped accessory does not match the expected phygital token");
    this.name = "AccessoryMismatchError";
  }
}

export type AccessoryConnection = {
  phygitalToken: string;
  /** ms since epoch — the browse-unlock cookie expiry. */
  expiresAt: number;
};

export async function connectAccessory(opts?: {
  expectedPhygitalToken?: string;
}): Promise<AccessoryConnection> {
  const rpc = getSolanaRpc();

  const challengeRes = await queryFetch("/accessory/unlock/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const { challengeId, challenge } = await readJson<{
    challengeId: string;
    challenge: string;
  }>(challengeRes, "Couldn’t start unlock");

  const response = await startAuthentication(challenge, rpc);

  const verifyRes = await queryFetch("/accessory/unlock/webauthn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, response }),
  });
  const body = await readJson<{
    isVerified: boolean;
    phygitalToken?: string;
    expiresAt?: number;
  }>(verifyRes, "Couldn’t verify this accessory");

  if (!body.isVerified || !body.phygitalToken) {
    throw new Error("Couldn’t verify this accessory");
  }

  if (
    opts?.expectedPhygitalToken &&
    opts.expectedPhygitalToken !== body.phygitalToken
  ) {
    throw new AccessoryMismatchError();
  }

  return {
    phygitalToken: body.phygitalToken,
    expiresAt: body.expiresAt ?? Date.now(),
  };
}
