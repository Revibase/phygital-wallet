import { SecretsVerifierBackend } from "./secrets.js";
import type { VerifierSignerBackend } from "./types.js";

/** Env fields required to construct a signing backend (avoids global Env clash). */
export type SignerBackendEnv = {
  VERIFIER_SIGNER_BACKEND?: string;
  VERIFIER_SECRET_KEYS?: string;
  VERIFIER_KMS_KEY_MAP?: string;
};

/**
 * Select signing backend from env.
 * `kms` is reserved — wire KmsVerifierBackend here when ready.
 */
export function createVerifierSignerBackend(
  env: SignerBackendEnv
): VerifierSignerBackend {
  const kind = (env.VERIFIER_SIGNER_BACKEND ?? "secrets").trim().toLowerCase();

  if (kind === "kms") {
    throw Object.assign(
      new Error(
        "VERIFIER_SIGNER_BACKEND=kms is not implemented yet; use secrets"
      ),
      { code: "signer_misconfigured" }
    );
  }

  if (kind !== "secrets") {
    throw Object.assign(new Error(`Unknown VERIFIER_SIGNER_BACKEND: ${kind}`), {
      code: "signer_misconfigured",
    });
  }

  return new SecretsVerifierBackend(env.VERIFIER_SECRET_KEYS);
}
