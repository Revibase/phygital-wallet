/** TokenSigner DO stub (`revibase-token-signer` via script_name). */
import { createLogger } from "@/shared/log";

/** Minimal RPC surface used by revibase-api (matches TokenSigner methods). */
export type TokenSignerRpc = {
  getFeeBalance(): Promise<{
    balanceLamports: number;
    reservedLamports?: number;
    availableLamports?: number;
  }>;
  applyFeeEvents(
    events: { signature: string; kind: "credit" | "debit"; lamports: number }[],
  ): Promise<{ applied: number; appliedSignatures: string[] }>;
  signTransactions(wires: string[]): Promise<
    | {
        ok: true;
        signatures: string[];
        audit?: {
          feePayer: string;
          signatureCount: number;
          reserved?: number;
        };
      }
    | {
        ok: false;
        status: number;
        body: {
          error: string;
          code: string;
          soft: boolean;
          details?: Record<string, unknown>;
        };
      }
  >;
};

export function tokenSigner(env: Env, phygitalToken: string): TokenSignerRpc {
  const token = phygitalToken.trim();
  if (!token) {
    throw new Error("phygitalToken required");
  }
  createLogger("api", env).debug("tokenSigner.stub", { phygitalToken: token });
  return env.TOKEN_SIGNER.getByName(token) as unknown as TokenSignerRpc;
}
