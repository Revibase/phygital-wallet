import { json } from "@/shared/http";

type CodedVerifierError = {
  code: string;
  error: string;
  soft: boolean;
  details?: Record<string, unknown>;
  status: number;
};

/** Parse thrown `{ code, soft?, details?, status? }` into a stable error shape. */
function mapCodedVerifierError(err: unknown): CodedVerifierError {
  const coded =
    err && typeof err === "object" && "code" in err
      ? (err as {
          code: string;
          soft?: boolean;
          details?: Record<string, unknown>;
          status?: number;
        })
      : null;

  const code = coded?.code ?? "invalid_transaction";
  return {
    code,
    error: err instanceof Error ? err.message : "Request failed",
    soft: Boolean(coded?.soft),
    details: coded?.details,
    // An error that knows its own status wins (e.g. ConnectProofError), so there
    // is exactly one code→status map per error family rather than a second table
    // maintained here.
    status:
      coded?.status ??
      (code === "signer_misconfigured"
        ? 500
        : code === "device_session_required" ||
          code === "owner_assertion_required" ||
          code === "challenge_invalid"
        ? 401
        : code === "verifier_mismatch" || code === "not_owner"
        ? 403
        : 400),
  };
}

/** Map a thrown coded error to the standard verifier error response. */
export function verifierJsonError(err: unknown) {
  const { code, error, soft, details, status } = mapCodedVerifierError(err);
  return json({ error, code, soft, details }, { status });
}

/** `/preview` answers policy denials in-band, so its envelope carries `ok`. */
export function previewJsonError(err: unknown) {
  const { code, error, soft, status } = mapCodedVerifierError(err);
  return json({ ok: false, code, error, soft }, { status });
}
