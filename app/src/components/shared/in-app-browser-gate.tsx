"use client";

import { toast } from "sonner";
import { Smartphone } from "lucide-react";

import { GateMessage } from "@/components/layout/gate-message";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function safariOpenHref(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const scheme =
      url.protocol === "https:" ? "x-safari-https" : "x-safari-http";
    return `${scheme}://${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Block WebAuthn NFC steps inside wallet / social in-app browsers. */
export function InAppBrowserGate({
  body = copy.gate.openInBrowserBody,
}: {
  body?: string;
}) {
  const href = typeof window !== "undefined" ? window.location.href : "";
  const safariHref = href && isIos() ? safariOpenHref(href) : null;

  return (
    <GateMessage
      icon={<Smartphone className="size-5 text-muted-foreground" />}
      title={copy.gate.openInBrowserTitle}
      body={body}
      action={
        <div className="flex w-full max-w-64 flex-col gap-2.5">
          {safariHref ? (
            <Button type="button" size="lg" className="w-full" asChild>
              <a href={safariHref}>{copy.gate.openInSafari}</a>
            </Button>
          ) : null}
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full"
            onClick={() => {
              void navigator.clipboard.writeText(href).then(
                () => toast.success(copy.gate.linkCopied),
                () => toast.error(copy.gate.linkCopyFailed),
              );
            }}
          >
            {copy.gate.copyLink}
          </Button>
        </div>
      }
    />
  );
}
