/**
 * Built-in accessory allow-list when a policy is active and a program has no
 * explicit override. Kept in the app (not on-chain rows) so settings can show
 * what a tap may call by default.
 */
export const POLICY_BASELINE_ACTIONS = [
  {
    label: "Send SOL",
    detail: "System program transfers",
  },
  {
    label: "Send tokens",
    detail: "SPL Token and Token-2022 transfers",
  },
  {
    label: "Create token accounts",
    detail: "Associated Token Account program",
  },
] as const;
