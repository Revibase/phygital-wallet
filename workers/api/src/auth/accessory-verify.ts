/**
 * Verify accessory Hold assertion and resolve the phygital token PDA.
 */
import { findPhygitalTokenPda, verifyResponse } from "phygital-token-sdk";

export async function verifyAccessoryAndResolveToken(args: {
  message: string;
  response: Parameters<typeof verifyResponse>[0]["response"];
}): Promise<
  | { ok: true; phygitalToken: string }
  | { ok: false; error: string; status: number }
> {
  let result: ReturnType<typeof verifyResponse>;
  try {
    result = verifyResponse({
      expectedMessage: args.message,
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
    return {
      ok: false,
      error: "Couldn’t verify this accessory",
      status: 403,
    };
  }

  return {
    ok: true,
    phygitalToken: String(
      await findPhygitalTokenPda(result.secp256r1PublicKey),
    ),
  };
}
