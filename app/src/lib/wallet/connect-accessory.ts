/**
 * Hold-to-unlock via WebAuthn — prove control of the accessory passkey, then
 * let the api worker issue the `browse_unlock` cookie.
 *
 *   POST /accessory/unlock/challenge → startAuthentication(challenge)
 *     → POST /accessory/unlock/webauthn → browse-unlock cookie
 *
 * When `expectedPhygitalToken` is set and the held item differs, throws
 * {@link AccessoryMismatchError} with the held PDA so UI can offer recovery
 * (retry expected vs open held). Cookie is already issued for the held item.
 */
import { startAuthentication } from "phygital-token-sdk";

import { queryFetch, readJson } from "@/lib/queries/http";
import { getSolanaRpc } from "@/lib/solana/rpc";

export class AccessoryMismatchError extends Error {
  readonly heldPhygitalToken: string;
  readonly expectedPhygitalToken: string;
  readonly expiresAt: number;

  constructor(args: {
    heldPhygitalToken: string;
    expectedPhygitalToken: string;
    expiresAt: number;
  }) {
    super("The tapped accessory does not match the expected phygital token");
    this.name = "AccessoryMismatchError";
    this.heldPhygitalToken = args.heldPhygitalToken;
    this.expectedPhygitalToken = args.expectedPhygitalToken;
    this.expiresAt = args.expiresAt;
  }
}

export type AccessoryConnection = {
  phygitalToken: string;
  /** ms since epoch — the browse-unlock cookie expiry. */
  expiresAt: number;
};

export async function connectAccessory(opts?: {
  /** When set, reject a tap that resolves to a different token PDA. */
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

  const expiresAt = body.expiresAt ?? Date.now();
  const connection: AccessoryConnection = {
    phygitalToken: body.phygitalToken,
    expiresAt,
  };

  if (
    opts?.expectedPhygitalToken &&
    opts.expectedPhygitalToken !== body.phygitalToken
  ) {
    throw new AccessoryMismatchError({
      heldPhygitalToken: body.phygitalToken,
      expectedPhygitalToken: opts.expectedPhygitalToken,
      expiresAt,
    });
  }

  return connection;
}
