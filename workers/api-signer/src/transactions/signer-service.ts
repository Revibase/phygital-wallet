/**
 * Canonical result type for the TokenSigner DO `signTransactions` RPC.
 */

/** Non-authoritative summary for centralized audit logging. */
export type SignAudit = {
  feePayer: string;
  signatureCount: number;
};

export type SignTransactionsResult =
  | { ok: true; signatures: string[]; audit?: SignAudit }
  | {
      ok: false;
      status: number;
      body: {
        error: string;
        code?: string;
        details?: Record<string, unknown>;
        /** Expected/recoverable condition the client can handle inline. */
        soft?: boolean;
      };
    };
