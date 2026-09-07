"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";
import { cn, shortAddress } from "@/lib/utils";

export function WalletAddressRow({
  address,
  length = 4,
  label = copy.address.wallet,
}: {
  address: string;
  length?: number;
  label?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/25 px-4 py-3 text-xs">
      <span className="text-muted-foreground">{copy.common.wallet}</span>
      <CopyableAddress address={address} length={length} label={label} />
    </div>
  );
}

/**
 * A truncated address the user can tap to copy in full. Verifiability is a core
 * trust signal — you can confirm exactly who you're paying — so this is reused
 * anywhere an address appears (header chip, recipient, history rows).
 */
export function CopyableAddress({
  address,
  length = 4,
  className,
  label = copy.address.default,
}: {
  address: string;
  /** Characters shown on each side of the ellipsis. */
  length?: number;
  className?: string;
  /** Accessible noun, e.g. "recipient address". */
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be blocked (permissions/insecure context); fail quietly.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onCopy}
      title={address}
      aria-label={
        copied ? copy.address.copiedAria(label) : copy.address.copyAria(label, address)
      }
      className={cn(
        "group/copy h-auto min-h-0 gap-1.5 rounded-md py-0.5 font-mono text-foreground hover:bg-transparent hover:text-foreground",
        className,
      )}
    >
      <span className="tabular-nums">{shortAddress(address, length)}</span>
      <span aria-hidden className="relative inline-flex size-3.5 items-center justify-center">
        <Copy
          className={cn(
            "absolute size-3.5 text-muted-foreground/70 transition-all duration-200",
            copied ? "opacity-0" : "opacity-100",
          )}
        />
        <Check
          className={cn(
            "absolute size-3.5 text-primary transition-all duration-200",
            copied ? "scale-100 opacity-100" : "scale-75 opacity-0",
          )}
          strokeWidth={2.5}
        />
      </span>
      <span aria-live="polite" className="sr-only">
        {copied ? copy.address.copiedToClipboard : ""}
      </span>
    </Button>
  );
}
