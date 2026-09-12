"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function WalletQrCode({
  value,
  size = 192,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("qrcode").then((QRCode) =>
      QRCode.toDataURL(value, {
        width: size * 2,
        margin: 1,
        color: { dark: "#111111", light: "#ffffff" },
        errorCorrectionLevel: "M",
      }).then((url) => {
        if (!cancelled) setSrc(url);
      })
    );
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) {
    return (
      <div
        className={cn("animate-pulse rounded-2xl bg-muted/40", className)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={cn("rounded-2xl", className)}
    />
  );
}
