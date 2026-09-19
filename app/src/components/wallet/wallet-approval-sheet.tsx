"use client";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ApprovalSheetBody } from "@/components/wallet/approval-sheet-body";
import { copy } from "@/lib/copy/phygital";
import {
  policyAmountLabel,
  policyRecipientLabel,
  policySoftDenyBody,
} from "@/lib/wallet/policy-deny-copy";
import type { WalletApprovalState } from "@/hooks/wallet/use-wallet-transaction";

/**
 * Shared policy-denial sheet driven by `useWalletTransaction`.
 * - `mode="owner"`: connected authority can approve → executeWithAuthority.
 * - `mode="blocked"`: unsigned / wrong wallet — explain owner approval only
 *   (no sign-in CTA; shared terminals must not prompt for a passkey here).
 */
export function WalletApprovalSheet({
  approval,
  tokenSymbol,
}: {
  approval: WalletApprovalState;
  /** Prefer a symbol over a truncated mint in the detail rows. */
  tokenSymbol?: string | null;
}) {
  const { open, mode, error, busy, onApprove, onCancel } = approval;
  const details = error?.details ?? null;
  const tokenLabel = tokenSymbol?.trim() || null;
  const detailRows =
    tokenLabel && mode === "owner"
      ? [{ label: copy.wallet.approveSendMint, value: tokenLabel }]
      : [];

  return (
    <Sheet
      open={open && Boolean(error)}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
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
              detailRows={detailRows}
              onApprove={onApprove}
              onClose={onCancel}
            />
          ) : (
            <ApprovalSheetBody
              mode="blocked"
              busy={busy}
              title={copy.wallet.policyNeedsAuthorityTitle}
              body={copy.wallet.policyNeedsAuthorityBody}
              amountLabel={policyAmountLabel(details, tokenSymbol)}
              recipientLabel={policyRecipientLabel(details)}
              detailRows={[]}
              onClose={onCancel}
            />
          )
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
