/**
 * Public API for `phygital-policy`.
 *
 * Config types/defaults are side-effect free and tree-shakeable.
 * `buildPaymentsPolicy` pulls Codama adapters — import only when verifying.
 * Persistence validation is owned by api-signer.
 */
export {
  DEFAULT_MAX_MINT_RAW,
  DEFAULT_MAX_SOL_LAMPORTS,
  uiAmountToRaw,
  type MintSpendLimit,
  type PaymentsPolicyConfig,
} from "./payments-policy-config.js";

export { buildPaymentsPolicy } from "./payments-policy.js";
