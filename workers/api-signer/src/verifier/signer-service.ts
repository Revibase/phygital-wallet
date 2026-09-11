/**
 * Canonical result types for TokenSigner DO authorize / sign RPC.
 */
import type { ConfigAction } from "@/verifier/decode-tx";

/** Non-authoritative summary for centralized audit logging. */
export type SignAudit = {
  kind: "execute" | "config";
  configAction?: ConfigAction;
  verifier: string;
  /** Execute intent hash (null for config changes). */
  intentHash: string | null;
  signatureCount: number;
};

export type SignTransactionsResult =
  | { ok: true; signatures: string[]; audit?: SignAudit }
  | {
      ok: false;
      status: number;
      body: {
        error: string;
        code: string;
        soft: boolean;
        details?: Record<string, unknown>;
      };
    };

export type PreviewAuthorizeResult =
  | { ok: true; intentHash: string }
  | {
      ok: false;
      code: string;
      error: string;
      soft: boolean;
      intentHash?: string;
      details?: Record<string, unknown>;
      httpStatus?: number;
    };
