/**
 * Browse-unlock session lifetime, shared so the cookie and accessory unlock
 * app-session cookie cannot drift apart: both are minted from the same tap and
 * are meant to lapse together.
 */
export const VERIFIER_SESSION_TTL_MS = 15 * 60 * 1000;
