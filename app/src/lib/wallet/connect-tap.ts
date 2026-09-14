/**
 * NFC dynamic-URL cold start — app-owned (deliberately not in the consumer SDK,
 * since only the Revibase app ever receives these URLs).
 *
 *   { pk, s, c, n } → POST /accessory/unlock/tap → browse-unlock cookie
 *
 * The api worker verifies the chip signature, resolves the token PDA, and sets
 * the `browse_unlock` cookie. No client-side token resolution or bearer.
 */
import { queryFetch, readJson } from "@/lib/queries/http";

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
  const res = await queryFetch("/accessory/unlock/tap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await readJson<{
    isVerified: boolean;
    phygitalToken?: string;
    expiresAt?: number;
  }>(res, "verification failed");

  if (!body.isVerified || !body.phygitalToken) {
    throw new Error("No phygital token for this accessory");
  }

  return {
    phygitalToken: body.phygitalToken,
    identifier: params.pk,
    expiresAt: body.expiresAt ?? Date.now(),
  };
}
