/**
 * Soft-deny inbox TTL — must match TokenSigner DO `PENDING_APPROVAL_TTL_MS`.
 * Watch tickets and owner response window share this bound.
 */
export const PENDING_APPROVAL_TTL_MS = 5 * 60 * 1000;
