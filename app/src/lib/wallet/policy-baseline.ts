/**
 * Built-in accessory allow-list when a policy is active and a program has no
 * explicit override. Kept for product reference; the status UI implies this via
 * the Everyday payments one-liner (DD-018) rather than listing each action.
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
