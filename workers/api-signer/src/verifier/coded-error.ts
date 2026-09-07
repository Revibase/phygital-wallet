/** Parse thrown `{ code, soft?, details? }` into a stable RPC error shape. */
type CodedVerifierError = {
  code: string;
  error: string;
  soft: boolean;
  details?: Record<string, unknown>;
  status: number;
};

export function mapCodedVerifierError(err: unknown): CodedVerifierError {
  const coded =
    err && typeof err === "object" && "code" in err
      ? (err as {
          code: string;
          soft?: boolean;
          details?: Record<string, unknown>;
        })
      : null;

  const code = coded?.code ?? "invalid_transaction";
  return {
    code,
    error: err instanceof Error ? err.message : "Request failed",
    soft: Boolean(coded?.soft),
    details: coded?.details,
    status:
      code === "signer_misconfigured"
        ? 500
        : code === "device_session_required" ||
            code === "owner_assertion_required" ||
            code === "challenge_invalid"
          ? 401
          : code === "verifier_mismatch" || code === "not_owner"
            ? 403
            : 400,
  };
}
