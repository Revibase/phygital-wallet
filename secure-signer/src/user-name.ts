/**
 * Passkey account labels shown in the password manager / OS sheet.
 * These are NOT cryptographic; the WebAuthn user.id stays a random opaque handle.
 */

export const USER_NAME_MIN = 3;
export const USER_NAME_MAX = 32;
/** Letters, digits, and common handle punctuation. */
const USER_NAME_RE = /^[a-zA-Z0-9._-]+$/;

export type UserNameValidation =
  | { ok: true; userName: string }
  | { ok: false; reason: string };

export function normalizeUserName(raw: string): string {
  return raw.trim();
}

export function validateUserName(raw: string): UserNameValidation {
  const userName = normalizeUserName(raw);
  if (userName.length < USER_NAME_MIN) {
    return {
      ok: false,
      reason: `Use at least ${USER_NAME_MIN} characters.`,
    };
  }
  if (userName.length > USER_NAME_MAX) {
    return {
      ok: false,
      reason: `Use at most ${USER_NAME_MAX} characters.`,
    };
  }
  if (!USER_NAME_RE.test(userName)) {
    return {
      ok: false,
      reason: "Use letters, numbers, dots, underscores, or hyphens.",
    };
  }
  return { ok: true, userName };
}
