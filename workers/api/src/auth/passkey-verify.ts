import { createSolanaRpc } from "@solana/kit";
import {
  fetchPhygitalTokenByIdentifier,
  findPhygitalTokenPda,
  verifyResponse,
} from "phygital-token-sdk";

import { getRpcUrl } from "@/shared/solana/cluster";

export type AuthenticationResponseJSON = {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string | null;
  };
  clientExtensionResults?: Record<string, unknown>;
  authenticatorAttachment?: string;
};

export async function verifyPasskeyAndResolveToken(args: {
  message: string;
  response: AuthenticationResponseJSON;
}): Promise<
  | { ok: true; phygitalToken: string; secp256r1PublicKey: string }
  | { ok: false; error: string; status: number }
> {
  let result: ReturnType<typeof verifyResponse>;
  try {
    result = verifyResponse({
      expectedMessage: args.message,
      response: args.response as Parameters<typeof verifyResponse>[0]["response"],
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Passkey verification failed",
      status: 401,
    };
  }

  if (!result.isVerified) {
    return { ok: false, error: "Invalid passkey signature", status: 401 };
  }

  const phygitalToken = await findPhygitalTokenPda(result.secp256r1PublicKey);
  return {
    ok: true,
    phygitalToken: String(phygitalToken),
    secp256r1PublicKey: result.secp256r1PublicKey,
  };
}

/**
 * Resolve token PDA from a verify-tap chip identifier (NFC URL `pk`).
 * PDA is seeded by on-chain passkey `publicKey`, not the identifier.
 */
export async function resolveTokenFromIdentifier(
  identifier: string,
): Promise<string | null> {
  try {
    const account = await fetchPhygitalTokenByIdentifier(
      createSolanaRpc(getRpcUrl()),
      identifier,
    );
    if (!account) return null;
    return String(await findPhygitalTokenPda(account.publicKey));
  } catch {
    return null;
  }
}
