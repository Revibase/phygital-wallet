/**
 * Browse-unlock / owner-browse session lifetime. Accessory Hold and per-item
 * owner browse share the same short window.
 */
export const BROWSE_SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Owner `login()` duration. PUT `/owner-wallet/blob` mints `revibase_owner_session`
 * for this long; the app treats the user as signed in for the same window.
 */
/** Login session — shorter than a day to limit subdomain/session reuse window. */
export const OWNER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
