"use client";

import { Button } from "@/components/ui/button";
import {
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { copy } from "@/lib/copy/phygital";

/** Shared soft-deny / open-approval sheet chrome. */
export function ApprovalSheetBody({
  title,
  body,
  hint,
  amountLabel,
  recipientLabel,
  detailRows,
  busy,
  mode,
  visitorPhase = "idle",
  onApprove,
  onClose,
}: {
  title: string;
  body: string;
  hint?: string;
  amountLabel?: string;
  recipientLabel?: string;
  detailRows: { label: string; value: string }[];
  busy: boolean;
  mode: "owner" | "visitor";
  visitorPhase?: "denied" | "idle";
  onApprove: () => void;
  onClose: () => void;
}) {
  const showRecap = Boolean(amountLabel || recipientLabel);

  return (
    <div className="flex flex-col gap-5 px-4 pb-8 pt-2">
      <SheetHeader className="px-0 text-center sm:text-center">
        <SheetTitle className="font-(family-name:--font-display) text-2xl font-medium">
          {title}
        </SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          {body}
        </SheetDescription>
        {hint ? (
          <p className="text-xs text-muted-foreground/80">{hint}</p>
        ) : null}
      </SheetHeader>
      {showRecap || detailRows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-muted/25 text-left">
          {showRecap ? (
            <div className="border-b border-border/40 px-4 py-3">
              {amountLabel ? (
                <p className="font-(family-name:--font-display) text-lg">
                  {amountLabel}
                </p>
              ) : null}
              {recipientLabel ? (
                <p className="text-xs text-muted-foreground">
                  {copy.wallet.to} {recipientLabel}
                </p>
              ) : null}
            </div>
          ) : null}
          {detailRows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 text-sm last:border-b-0"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium tabular-nums">{row.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      <SheetFooter className="gap-2 p-0 sm:flex-col">
        {mode === "owner" ? (
          <>
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={onApprove}
            >
              {busy ? <Spinner className="size-4" /> : copy.wallet.approveOnce}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={onClose}
            >
              {copy.wallet.denyOnce}
            </Button>
          </>
        ) : visitorPhase === "denied" ? (
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={onClose}
          >
            {copy.common.done}
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={onClose}
          >
            {copy.wallet.nearbyPolicyGotIt}
          </Button>
        )}
      </SheetFooter>
    </div>
  );
}
