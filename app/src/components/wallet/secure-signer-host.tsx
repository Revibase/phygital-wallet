"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { getSecureSignerClient } from "@/lib/wallet/secure-signer-client";

/**
 * Soft-lazy secure-signer host. Mounts on first `ensureHost` / auth need so
 * the cross-origin iframe is not loaded on every page boot.
 */
export function LazySecureSignerHost() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    return getSecureSignerClient().onNeedHost(() => setMounted(true));
  }, []);

  if (!mounted) return null;
  return <SecureSignerHost />;
}

/**
 * Interactive passkey unlock / tx approval via shadcn Sheet.
 *
 * Shell registers on mount; iframe mounts only while the Sheet is open
 * (normal Radix lifecycle — no `forceMount`, no `<html>` portal).
 */
export function SecureSignerHost() {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  openRef.current = open;

  useEffect(() => {
    const client = getSecureSignerClient();
    client.attachShell({
      setOpen,
      isOpen: () => openRef.current,
    });
    return () => client.detachShell();
  }, []);

  const attachIframe = useCallback((iframe: HTMLIFrameElement | null) => {
    const client = getSecureSignerClient();
    if (!iframe) {
      client.detachIframe();
      return;
    }
    client.attachIframe(iframe);
  }, []);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) getSecureSignerClient().cancelFromHost();
        setOpen(next);
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        overlayClassName="z-60"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="z-60 gap-0 overflow-hidden rounded-t-3xl border-0 bg-[#f7f4ef] p-0 shadow-[0_-8px_40px_rgba(0,0,0,.18)] sm:max-w-100 sm:rounded-3xl sm:shadow-[0_20px_60px_rgba(26,31,30,.18)]"
      >
        <SheetTitle className="sr-only">Secure signer</SheetTitle>
        <SheetDescription className="sr-only">
          Passkey unlock and transaction approval
        </SheetDescription>
        {/*
          Do not set `src` here — SecureSignerClient.attachIframe assigns it once
          so SIGNER_READY is not raced against a double navigation.
        */}
        <iframe
          ref={attachIframe}
          title="Secure signer"
          allow="publickey-credentials-get"
          className="block h-[min(560px,88vh)] w-full border-0 sm:h-[min(520px,90vh)]"
        />
      </SheetContent>
    </Sheet>
  );
}
