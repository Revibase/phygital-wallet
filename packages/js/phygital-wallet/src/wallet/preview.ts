/** Policy denial from `/preview` or `/sign`. */
export class PolicyDeniedError extends Error {
  readonly code: string;
  readonly soft: boolean;
  readonly intentHash?: string;
  readonly details?: Record<string, unknown>;

  constructor(args: {
    code: string;
    error: string;
    soft?: boolean;
    intentHash?: string;
    details?: Record<string, unknown>;
  }) {
    super(args.error);
    this.name = "PolicyDeniedError";
    this.code = args.code;
    this.soft = args.soft ?? false;
    this.intentHash = args.intentHash;
    this.details = args.details;
  }
}
