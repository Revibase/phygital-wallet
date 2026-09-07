import { getBase64Decoder, type Address, type Instruction } from "@solana/kit";

import { verifierPreviewUrl } from "./verifier-endpoint.js";

const base64Decoder = getBase64Decoder();

/** Soft or hard policy denial from `/preview` or `/sign`. */
export class PolicyDeniedError extends Error {
  readonly code: string;
  readonly soft: boolean;
  readonly intentHash?: string;
  readonly details?: Record<string, unknown>;

  constructor(args: {
    code: string;
    error: string;
    soft: boolean;
    intentHash?: string;
    details?: Record<string, unknown>;
  }) {
    super(args.error);
    this.name = "PolicyDeniedError";
    this.code = args.code;
    this.soft = args.soft;
    this.intentHash = args.intentHash;
    this.details = args.details;
  }
}

/**
 * Advisory policy check before NFC. Throws {@link PolicyDeniedError} when denied.
 * `endpoint` is the verifier API base; posts to `/preview`.
 */
export async function previewWalletIntent(args: {
  phygitalToken: Address;
  instructions: readonly Instruction[];
  endpoint: string;
  fetch?: typeof fetch;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const httpFetch = args.fetch ?? fetch;
  const response = await httpFetch(verifierPreviewUrl(args.endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phygitalToken: String(args.phygitalToken),
      instructions: args.instructions.map((ix) => ({
        programAddress: String(ix.programAddress),
        accounts: (ix.accounts ?? []).map((a) => ({
          address: String(a.address),
          ...(a.role != null ? { role: a.role as string | number } : {}),
        })),
        data: ix.data ? base64Decoder.decode(new Uint8Array(ix.data)) : "",
      })),
    }),
    signal: args.abortSignal,
  });

  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    intentHash?: string;
    code?: string;
    error?: string;
    soft?: boolean;
    details?: Record<string, unknown>;
  };

  if (body.ok === true) return;

  throw new PolicyDeniedError({
    code: body.code ?? "invalid_transaction",
    error: body.error ?? `Policy preview failed (${response.status})`,
    soft: Boolean(body.soft),
    intentHash: body.intentHash,
    details: body.details,
  });
}
