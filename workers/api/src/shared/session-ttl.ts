/**
 * Browse-unlock / owner-browse session lifetime. Accessory Hold and per-item
 * owner browse share the same short window.
 */
export const VERIFIER_SESSION_TTL_MS = 30 * 60 * 1000;

/** Phone owner wallet unlocked for home — longer than per-item browse. */
export const OWNER_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
