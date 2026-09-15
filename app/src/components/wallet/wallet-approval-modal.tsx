"use client";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ApprovalSheetBody } from "@/components/wallet/approval-sheet-body";
import { copy } from "@/lib/copy/phygital";
import {
  policyAmountLabel,
  policyApprovalDetailRows,
  policyRecipientLabel,
  policySoftDenyBody,
} from "@/lib/wallet/policy-deny-copy";
import type { WalletApprovalState } from "@/hooks/wallet/use-wallet-transaction";

/**
 * Shared policy-denial sheet driven by `useWalletTransaction`.
 * - `mode="owner"`: the connected authority can approve → executeWithAuthority.
 * - `mode="visitor"`: the connected wallet isn't the authority → rejection only.
 */
export function WalletApprovalModal({
  approval,
  tokenSymbol,
}: {
  approval: WalletApprovalState;
  /** Prefer a symbol over a truncated mint in the detail rows. */
  tokenSymbol?: string | null;
}) {
  const { open, mode, error, busy, onApprove, onCancel } = approval;
  const details = error?.details ?? null;

  return (
    <Sheet
      open={open && Boolean(error)}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <SheetContent
        side="bottom"
        className="mx-auto max-w-lg rounded-t-3xl md:rounded-3xl"
      >
        {error ? (
          mode === "owner" ? (
            <ApprovalSheetBody
              mode="owner"
              busy={busy}
              title={copy.wallet.approveSendTitle}
              body={policySoftDenyBody(error)}
              amountLabel={policyAmountLabel(details, tokenSymbol)}
              recipientLabel={policyRecipientLabel(details)}
              detailRows={policyApprovalDetailRows(details, {
                omitDestination: true,
                omitAmount: true,
                tokenLabel: tokenSymbol,
              })}
              onApprove={onApprove}
              onClose={onCancel}
            />
          ) : (
            <ApprovalSheetBody
              mode="visitor"
              visitorPhase="denied"
              busy={busy}
              title={copy.wallet.nearbyPolicyTitle}
              body={copy.wallet.visitorNeedsApprovalBody}
              hint={copy.wallet.visitorNeedsApprovalHint}
              amountLabel={policyAmountLabel(details, tokenSymbol)}
              recipientLabel={policyRecipientLabel(details)}
              detailRows={[]}
              onApprove={onApprove}
              onClose={onCancel}
            />
          )
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
