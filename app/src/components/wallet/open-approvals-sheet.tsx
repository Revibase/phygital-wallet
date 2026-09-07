"use client";

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PolicyDeniedError } from "phygital-wallet-sdk";

import { NavBar } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
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
import { policyApprovalDetailRows, policySoftDenyBody } from "@/lib/wallet/policy-deny-copy";

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

/** Inbox for remote soft-deny requests — Approve once writes a grant only. */
export function OpenApprovalsSheet({
  phygitalTokenPda,
  approvals,
  onChangeLimits,
  onDone,
}: {
  phygitalTokenPda: string;
  approvals: OpenApproval[];
  onChangeLimits?: (code?: string) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const approval = approvals[0] ?? null;

  useEffect(() => {
    if (approvals.length === 0) onDone();
  }, [approvals.length, onDone]);

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

  const cancel = useMutation({
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

  const busy = approve.isPending || cancel.isPending;

  if (!approval) return null;

  const detailRows = policyApprovalDetailRows(approval.details);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <NavBar
        leading={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onDone}
          >
            {copy.wallet.openApprovalsLater}
          </Button>
        }
        title={copy.wallet.openApprovalsTitle}
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-2 text-center">
        <h2 className="font-(family-name:--font-display) text-2xl font-medium">
          {copy.wallet.approveSendTitle}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {approvalBody(approval)}
        </p>
        {detailRows.length > 0 ? (
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-muted/25 text-left text-sm">
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
      </div>
      <div className="flex flex-col gap-2">
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
        {onChangeLimits ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={() => onChangeLimits(approval.code)}
          >
            {copy.wallet.changeLimits}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={busy}
          onClick={() => void cancel.mutateAsync(approval.intentHash)}
        >
          {copy.common.cancel}
        </Button>
      </div>
    </div>
  );
}
