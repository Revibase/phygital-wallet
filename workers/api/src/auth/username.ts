/**
 * Twitter / X username rules: 4–15 chars, letters, numbers, underscore.
 * Canonical id is lowercase (case-insensitive uniqueness).
 */

const USERNAME_RE = /^[A-Za-z0-9_]{4,15}$/;

export type ParsedUsername = {
  /** Lowercase canonical id — WebAuthn userID / DB user_handle. */
  id: string;
  /** Preferred display casing for WebAuthn userName / userDisplayName. */
  display: string;
};

export function parseUsername(raw: string): ParsedUsername | null {
  const trimmed = raw.trim().replace(/^@+/, "");
  if (!USERNAME_RE.test(trimmed)) return null;
  return { id: trimmed.toLowerCase(), display: trimmed };
}
