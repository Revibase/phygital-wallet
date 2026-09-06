import { json } from "@/shared/http";

type CodedVerifierError = {
  code: string;
  error: string;
  soft: boolean;
  details?: Record<string, unknown>;
  status: number;
};

/** Parse thrown `{ code, soft?, details? }` into a stable API/RPC error shape. */
function mapCodedVerifierError(err: unknown): CodedVerifierError {
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
        : code === "verifier_mismatch"
          ? 403
          : 400,
  };
}

/** Map thrown coded errors to HTTP responses. */
export function verifierJsonError(err: unknown, kind: "preview" | "sign") {
  const { code, error, soft, details, status } = mapCodedVerifierError(err);

  if (kind === "preview") {
    return json({ ok: false, code, error, soft }, { status });
  }
  return json({ error, code, soft, details }, { status });
}
