"use client";

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PolicyDeniedError } from "phygital-wallet-sdk";

import { ApprovalSheetBody } from "@/components/wallet/approval-sheet-body";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useMintMeta } from "@/hooks/wallet/use-activity-mint-meta";
import { copy } from "@/lib/copy/phygital";
import { queryKeys } from "@/lib/queries";
import { getUsdcMint } from "@/lib/tokens/usdc-mint";
import { NATIVE_SOL_MINT } from "@/lib/tokens/payment-token";
import { toUserErrorMessage } from "@/lib/user-errors";
import { handleOwnerAuthFailure } from "@/lib/wallet/device-sign-in-href";
import {
  createOneTimeGrant,
  denyOpenApproval,
  type OpenApproval,
} from "@/lib/wallet/policies-client";
import {
  policyAmountLabel,
  policyApprovalDetailRows,
  policyRecipientLabel,
  policySoftDenyBody,
} from "@/lib/wallet/policy-deny-copy";

function approvalBody(approval: OpenApproval): string {
  const deny = new PolicyDeniedError({
    code: approval.code,
    error: approval.error,
    soft: true,
    intentHash: approval.intentHash,
    details: approval.details ?? undefined,
  });
  return policySoftDenyBody(deny);
}

function removeApproval(
  prev: OpenApproval[] | undefined,
  intentHash: string,
): OpenApproval[] {
  return (prev ?? []).filter((a) => a.intentHash !== intentHash);
}

function knownSymbolForMint(mint: string | null): string | null {
  if (!mint) return null;
  if (mint === NATIVE_SOL_MINT) return "SOL";
  if (mint === String(getUsdcMint())) return "USDC";
  return null;
}

function approvalSymbol(
  details: Record<string, unknown> | null | undefined,
  mintMeta: Record<string, { symbol: string }>,
): string | null {
  if (typeof details?.symbol === "string" && details.symbol.trim()) {
    return details.symbol.trim();
  }
  const mint = typeof details?.mint === "string" ? details.mint : null;
  if (!mint) return null;
  return mintMeta[mint]?.symbol?.trim() || knownSymbolForMint(mint);
}

export function OpenApprovalsSheet({
  phygitalTokenPda,
  approvals,
  open,
  onDismiss,
}: {
  phygitalTokenPda: string;
  approvals: OpenApproval[];
  open: boolean;
  onDismiss: (intentHash: string) => void;
}) {
  const queryClient = useQueryClient();
  const approval = approvals[0] ?? null;
  const approvalsKey = queryKeys.walletApprovals.byToken(phygitalTokenPda);

  const mint = useMemo(() => {
    const raw = approval?.details?.mint;
    return typeof raw === "string" ? raw : null;
  }, [approval?.details?.mint]);

  const mintMeta = useMintMeta(mint ? [mint] : []);
  const symbol = approvalSymbol(approval?.details, mintMeta);
  const recipientLabel = policyRecipientLabel(approval?.details);

  function dropFromCache(intentHash: string) {
    queryClient.setQueryData(approvalsKey, (prev: OpenApproval[] | undefined) =>
      removeApproval(prev, intentHash),
    );
    void queryClient.invalidateQueries({ queryKey: approvalsKey });
  }

  const approve = useMutation({
    mutationFn: (intentHash: string) =>
      createOneTimeGrant(phygitalTokenPda, intentHash),
    onSuccess: (_data, intentHash) => {
      toast.success(copy.wallet.openApprovalContinue);
      dropFromCache(intentHash);
      onDismiss(intentHash);
    },
    onError: (e) => {
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      toast.error(toUserErrorMessage(e));
    },
  });

  const deny = useMutation({
    mutationFn: (intentHash: string) =>
      denyOpenApproval(phygitalTokenPda, intentHash),
    onSuccess: (_data, intentHash) => {
      toast.message(copy.wallet.openApprovalDenied);
      dropFromCache(intentHash);
      onDismiss(intentHash);
    },
    onError: (e) => {
      toast.error(toUserErrorMessage(e));
    },
  });

  const busy = approve.isPending || deny.isPending;

  function denyIfStillOpen(intentHash: string) {
    const stillOpen = queryClient
      .getQueryData<OpenApproval[]>(approvalsKey)
      ?.some((a) => a.intentHash === intentHash);
    if (stillOpen) void deny.mutateAsync(intentHash);
  }

  return (
    <Sheet
      open={open && approval != null}
      onOpenChange={(next) => {
        if (!next && !busy && approval) denyIfStillOpen(approval.intentHash);
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (busy || !approval) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          denyIfStillOpen(approval.intentHash);
        }}
        className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-3xl p-0 md:rounded-3xl"
      >
        {approval ? (
          <ApprovalSheetBody
            title={copy.wallet.approveSendTitle}
            body={approvalBody(approval)}
            amountLabel={policyAmountLabel(approval.details, symbol)}
            recipientLabel={recipientLabel}
            detailRows={policyApprovalDetailRows(approval.details, {
              omitAmount: true,
              omitDestination: Boolean(recipientLabel),
              omitMint: Boolean(symbol),
              omitTechnical: Boolean(
                policyAmountLabel(approval.details, symbol) && recipientLabel,
              ),
            })}
            busy={busy}
            mode="owner"
            onApprove={() => void approve.mutateAsync(approval.intentHash)}
            onClose={() => denyIfStillOpen(approval.intentHash)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
