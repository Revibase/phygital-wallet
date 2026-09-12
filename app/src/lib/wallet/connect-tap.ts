/**
 * NFC dynamic-URL cold start — app-owned (deliberately not in the consumer SDK,
 * since only the Revibase app ever receives these URLs).
 *
 *   { pk, s, c, n } → resolve the token's verifier → POST {verifier}/connect/tap
 *                   → bearer → POST /auth/app-session → browse cookie
 *
 * The bearer comes from the token's *own* verifier, so it works for `/preview`
 * and `/sign` even when that verifier is a third party, and the app-session
 * exchange can validate it against the on-chain verifier set.
 */
import {
  fetchPhygitalTokenByIdentifier,
  findPhygitalTokenPda,
} from "phygital-token-sdk";
import { normalizeVerifierApiBase, resolveVerifier } from "phygital-wallet-sdk";
import type { Address } from "@solana/kit";

import { getSolanaRpc } from "@/lib/solana/rpc";
import { adoptVerifierSession } from "@/lib/wallet/verifier-session";

export type DynamicTapParams = {
  pk: string;
  s: string;
  c: string;
  n: string;
};

export type DynamicTapConnection = {
  phygitalToken: string;
  identifier: string;
  expiresAt: number;
};

export async function connectDynamicTap(
  params: DynamicTapParams
): Promise<DynamicTapConnection> {
  const rpc = getSolanaRpc();

  // Resolve the chip's token so we know which verifier to connect to.
  const account = await fetchPhygitalTokenByIdentifier(rpc, params.pk);
  if (!account) {
    throw new Error("No phygital token for this accessory");
  }
  const phygitalToken = await findPhygitalTokenPda(account.publicKey);

  const resolved = await resolveVerifier(rpc, phygitalToken);
  const url = `${normalizeVerifierApiBase(resolved.endpoint)}/connect/tap`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phygitalToken, ...params }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    accessToken?: string;
    expiresAt?: number;
    error?: string;
  };
  if (!res.ok || !body.accessToken) {
    throw new Error(body.error ?? "verification failed");
  }

  const { expiresAt } = await adoptVerifierSession(phygitalToken, {
    accessToken: body.accessToken,
    expiresAt: body.expiresAt ?? Date.now(),
  });
  return { phygitalToken, identifier: params.pk, expiresAt };
}
