"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PolicyDeniedError } from "phygital-wallet-sdk";

import { ApprovalSheetBody } from "@/components/wallet/approval-sheet-body";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { copy } from "@/lib/copy/phygital";
import { queryKeys } from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";
import { handleOwnerAuthFailure } from "@/lib/wallet/device-sign-in-href";
import {
  createOneTimeGrant,
  type OpenApproval,
} from "@/lib/wallet/policies-client";
import {
  policyAmountLabel,
  policyApprovalDetailRows,
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

/** Inbox for remote soft-deny requests — Approve (API) / Deny (local). */
export function OpenApprovalsSheet({
  phygitalTokenPda,
  approvals,
  open,
  onDismiss,
}: {
  phygitalTokenPda: string;
  approvals: OpenApproval[];
  open: boolean;
  /** Local dismiss (Deny) or after Approve — parent filters by intentHash. */
  onDismiss: (intentHash: string) => void;
}) {
  const queryClient = useQueryClient();
  const approval = approvals[0] ?? null;
  const approvalsKey = queryKeys.walletApprovals.byToken(phygitalTokenPda);

  const approve = useMutation({
    mutationFn: async (intentHash: string) =>
      createOneTimeGrant(phygitalTokenPda, intentHash),
    onMutate: async (intentHash) => {
      await queryClient.cancelQueries({ queryKey: approvalsKey });
      const previous = queryClient.getQueryData<OpenApproval[]>(approvalsKey);
      queryClient.setQueryData(approvalsKey, (prev: OpenApproval[] | undefined) =>
        removeApproval(prev, intentHash),
      );
      return { previous };
    },
    onSuccess: (_data, intentHash) => {
      toast.success(copy.wallet.openApprovalContinue);
      onDismiss(intentHash);
      void queryClient.invalidateQueries({ queryKey: approvalsKey });
    },
    onError: (e, _intentHash, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(approvalsKey, context.previous);
      }
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      toast.error(toUserErrorMessage(e));
    },
  });

  const busy = approve.isPending;

  return (
    <Sheet
      open={open && approval != null}
      onOpenChange={(next) => {
        if (!next && !busy && approval) onDismiss(approval.intentHash);
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
          onDismiss(approval.intentHash);
        }}
        className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-3xl p-0"
      >
        {approval ? (
          <ApprovalSheetBody
            title={copy.wallet.approveSendTitle}
            body={approvalBody(approval)}
            amountLabel={policyAmountLabel(approval.details)}
            detailRows={policyApprovalDetailRows(approval.details, {
              omitAmount: true,
            })}
            busy={busy}
            mode="owner"
            onApprove={() => void approve.mutateAsync(approval.intentHash)}
            onClose={() => onDismiss(approval.intentHash)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
