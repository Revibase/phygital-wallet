import type {
  ProgramAccessKind,
  ProgramPermissionView,
} from "@/hooks/token/use-wallet-policy";

export type ProgramPermissionDraft = {
  programId: string;
  /** `custom` rows are read-only; their `access` is preserved verbatim. */
  kind: ProgramAccessKind;
  access: ProgramPermissionView["access"] | null;
};

/** On-chain cap max is 8 per-mint caps. */
export const MAX_MINT_CAPS = 8;
export const DEFAULT_POLICY_WINDOW = 604_800n; // weekly
