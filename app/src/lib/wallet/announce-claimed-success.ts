import { toast } from "sonner";

import { copy } from "@/lib/copy/phygital";

/**
 * Quiet post-claim confirmation — lands in the destination without a blocking
 * dialog. Optional action deep-links to spend limits.
 */
export function announceClaimedSuccess(args?: {
  onLimitSpend?: () => void;
}): void {
  toast.success(copy.wallet.policyClaimedTitle, {
    description: copy.wallet.policyClaimedBody,
    action: args?.onLimitSpend
      ? {
          label: copy.wallet.policyClaimedLimit,
          onClick: args.onLimitSpend,
        }
      : undefined,
  });
}
