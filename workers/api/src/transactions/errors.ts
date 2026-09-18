import { normalizeError } from "@/shared/errors";
import { json } from "@/shared/http";

export function signRouteJsonError(err: unknown) {
  const { error, code, details, soft, status } = normalizeError(err);
  return json({ error, code, details, soft }, { status });
}
