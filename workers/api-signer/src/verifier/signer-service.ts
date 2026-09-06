/**
 * Canonical result types for TokenSigner DO authorize / sign RPC.
 */

export type SignTransactionsResult =
  | { ok: true; signatures: string[] }
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
