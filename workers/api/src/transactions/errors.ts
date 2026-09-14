import { normalizeError } from "@/shared/errors";
import { json } from "@/shared/http";

/** Map a thrown coded error to the standard verifier error response. */
export function verifierJsonError(err: unknown) {
  const { error, code, details, soft, status } = normalizeError(err);
  return json({ error, code, details, soft }, { status });
}
