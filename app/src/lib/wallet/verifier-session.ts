/**
 * In-memory verifier session bearers, keyed by phygital token.
 *
 * Deliberately memory-only (not localStorage): the bearer authenticates
 * `/preview` and `/sign`, so persisting it would widen XSS exposure for little
 * gain — it expires in 15 minutes and a lapsed session just costs another tap.
 * The `browse_unlock` cookie is what survives a reload for app routes.
 */

import { SESSION_SKEW_MS } from "phygital-wallet-sdk";

import { exchangeAppSession } from "@/lib/wallet/device-auth-client";

export type VerifierSession = {
  accessToken: string;
  /** ms since epoch. */
  expiresAt: number;
};

const sessions = new Map<string, VerifierSession>();

export function setVerifierSession(
  phygitalToken: string,
  session: VerifierSession,
): void {
  sessions.set(phygitalToken, session);
}

export function getVerifierSession(
  phygitalToken: string,
): VerifierSession | null {
  const session = sessions.get(phygitalToken);
  if (!session) return null;
  if (session.expiresAt - SESSION_SKEW_MS <= Date.now()) {
    sessions.delete(phygitalToken);
    return null;
  }
  return session;
}

/** Bearer provider for the SDK signer (`getAccessToken`). */
export function accessTokenFor(phygitalToken: string): () => string | null {
  return () => getVerifierSession(phygitalToken)?.accessToken ?? null;
}

/**
 * Adopt a freshly minted bearer: cache it for `/preview`+`/sign`, then exchange
 * it for the Revibase app-session cookie. Shared by both connect entry points so
 * the ordering (cache before exchange) lives in one place.
 */
export async function adoptVerifierSession(
  phygitalToken: string,
  session: VerifierSession,
): Promise<{ phygitalToken: string; expiresAt: number }> {
  setVerifierSession(phygitalToken, session);
  const { expiresAt } = await exchangeAppSession(session.accessToken);
  return { phygitalToken, expiresAt };
}
