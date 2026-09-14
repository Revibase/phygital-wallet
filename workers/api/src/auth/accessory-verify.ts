/**
 * Verify an accessory WebAuthn assertion (secp256r1 passkey tap) and resolve
 * the phygital token PDA it is seeded by.
 */
import { findPhygitalTokenPda, verifyResponse } from "phygital-token-sdk";

type AuthenticationResponseJSON = Parameters<
  typeof verifyResponse
>[0]["response"];

export type AccessoryVerifyResult =
  | { ok: true; phygitalToken: string; secp256r1PublicKey: string }
  | { ok: false; error: string; status: number };

/**
 * `expectedMessage` must be the server-issued challenge the accessory signed.
 * `verifyResponse` throws on a challenge mismatch and returns
 * `isVerified: false` for a bad signature.
 */
export async function verifyAccessoryWebauthn(args: {
  expectedMessage: string;
  response: AuthenticationResponseJSON;
}): Promise<AccessoryVerifyResult> {
  let result: ReturnType<typeof verifyResponse>;
  try {
    result = verifyResponse({
      expectedMessage: args.expectedMessage,
      response: args.response,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Passkey verification failed",
      status: 400,
    };
  }

  if (!result.isVerified || !result.secp256r1PublicKey) {
    return { ok: false, error: "Couldn’t verify this accessory", status: 403 };
  }

  return {
    ok: true,
    phygitalToken: String(await findPhygitalTokenPda(result.secp256r1PublicKey)),
    secp256r1PublicKey: result.secp256r1PublicKey,
  };
}
