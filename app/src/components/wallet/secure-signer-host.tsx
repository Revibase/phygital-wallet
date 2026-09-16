"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { SECURE_SIGNER_ORIGIN } from "@/lib/wallet/owner-backend";
import { getSecureSignerClient } from "@/lib/wallet/secure-signer-client";

/**
 * Secure-signer host.
 *
 * - shadcn Sheet → dimmed backdrop + scroll/focus lock (modal).
 * - iframe portaled as a direct child of `<html>` (sibling of `<body>`), so
 *   Radix `inert` on body children cannot swallow clicks — including inert
 *   from this Sheet itself and from the passkey setup Sheet.
 *
 * Trust-critical chrome stays inside the cross-origin iframe.
 */
export function SecureSignerHost() {
  const [open, setOpen] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const openRef = useRef(false);

  openRef.current = open;

  useEffect(() => {
    const el = document.createElement("div");
    el.setAttribute("data-secure-signer-portal", "1");
    document.documentElement.appendChild(el);
    setPortalEl(el);
    return () => {
      el.remove();
      setPortalEl(null);
    };
  }, []);

  const attachIframe = useCallback((iframe: HTMLIFrameElement | null) => {
    const client = getSecureSignerClient();
    if (!iframe) {
      client.detachHost();
      return;
    }
    client.attachHost({
      iframe,
      setOpen,
      isOpen: () => openRef.current,
    });
  }, []);

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) getSecureSignerClient().cancelFromHost();
          setOpen(next);
        }}
      >
        {/* Invisible content: we only want Sheet overlay + modal lock. */}
        <SheetContent
          side="bottom"
          showCloseButton={false}
          overlayClassName="z-60"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="pointer-events-none z-60 h-0 border-0 bg-transparent p-0 opacity-0 shadow-none"
        >
          <SheetTitle className="sr-only">Secure signer</SheetTitle>
          <SheetDescription className="sr-only">
            Passkey unlock and transaction approval
          </SheetDescription>
        </SheetContent>
      </Sheet>

      {portalEl
        ? createPortal(
            <div
              data-secure-signer-host=""
              aria-hidden={!open}
              className={
                open
                  ? "pointer-events-none fixed inset-0 z-61 flex items-end justify-center sm:items-center sm:p-6"
                  : "pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0"
              }
            >
              <iframe
                ref={attachIframe}
                title="Secure signer"
                src={`${SECURE_SIGNER_ORIGIN}/`}
                allow="publickey-credentials-get"
                className={
                  open
                    ? "pointer-events-auto block h-[min(560px,88vh)] w-full rounded-t-3xl border-0 bg-[#f7f4ef] shadow-[0_-8px_40px_rgba(0,0,0,.18)] sm:h-[min(520px,90vh)] sm:max-w-[400px] sm:rounded-3xl sm:shadow-[0_20px_60px_rgba(26,31,30,.18)]"
                    : "pointer-events-none block h-0 w-0 border-0 opacity-0"
                }
              />
            </div>,
            portalEl,
          )
        : null}
    </>
  );
}
