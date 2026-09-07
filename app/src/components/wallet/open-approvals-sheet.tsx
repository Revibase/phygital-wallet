"use client";

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PolicyDeniedError } from "phygital-wallet-sdk";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { copy } from "@/lib/copy/phygital";
import { queryKeys } from "@/lib/queries";
import { toUserErrorMessage } from "@/lib/user-errors";
import { handleOwnerAuthFailure } from "@/lib/wallet/device-sign-in-href";
import {
  cancelOpenApproval,
  createOneTimeGrant,
  type OpenApproval,
} from "@/lib/wallet/policies-client";
import {
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

/** Inbox for remote soft-deny requests — Approve once / Deny only. */
export function OpenApprovalsSheet({
  phygitalTokenPda,
  approvals,
  open,
  onOpenChange,
}: {
  phygitalTokenPda: string;
  approvals: OpenApproval[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const approval = approvals[0] ?? null;

  useEffect(() => {
    if (approvals.length === 0 && open) onOpenChange(false);
  }, [approvals.length, open, onOpenChange]);

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
    onSuccess: () => {
      toast.success(copy.wallet.openApprovalContinue);
    },
    onError: (e, _intentHash, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(approvalsKey, context.previous);
      }
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      toast.error(toUserErrorMessage(e));
    },
  });

  const deny = useMutation({
    mutationFn: async (intentHash: string) =>
      cancelOpenApproval(phygitalTokenPda, intentHash),
    onMutate: async (intentHash) => {
      await queryClient.cancelQueries({ queryKey: approvalsKey });
      const previous = queryClient.getQueryData<OpenApproval[]>(approvalsKey);
      queryClient.setQueryData(approvalsKey, (prev: OpenApproval[] | undefined) =>
        removeApproval(prev, intentHash),
      );
      return { previous };
    },
    onError: (e, _intentHash, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(approvalsKey, context.previous);
      }
      if (handleOwnerAuthFailure(phygitalTokenPda, e)) return;
      toast.error(toUserErrorMessage(e));
    },
  });

  const busy = approve.isPending || deny.isPending;
  const detailRows = approval
    ? policyApprovalDetailRows(approval.details)
    : [];

  return (
    <Sheet
      open={open && approval != null}
      onOpenChange={(next) => {
        if (!next && !busy) onOpenChange(false);
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
          void deny.mutateAsync(approval.intentHash);
        }}
        className="mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-t-3xl p-0"
      >
        {approval ? (
          <div className="flex flex-col gap-5 px-4 pb-8 pt-2">
            <SheetHeader className="px-0 text-center sm:text-center">
              <SheetTitle className="font-(family-name:--font-display) text-2xl font-medium">
                {copy.wallet.approveSendTitle}
              </SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                {approvalBody(approval)}
              </SheetDescription>
            </SheetHeader>
            {detailRows.length > 0 ? (
              <div className="overflow-hidden rounded-2xl bg-muted/25 text-left text-sm">
                {detailRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 last:border-b-0"
                  >
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-mono tabular-nums">{row.value}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <SheetFooter className="gap-2 p-0 sm:flex-col">
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={busy}
                onClick={() => void approve.mutateAsync(approval.intentHash)}
              >
                {busy ? (
                  <Spinner className="size-4" />
                ) : (
                  copy.wallet.approveOnce
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="w-full"
                disabled={busy}
                onClick={() => void deny.mutateAsync(approval.intentHash)}
              >
                {copy.wallet.denyOnce}
              </Button>
            </SheetFooter>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
