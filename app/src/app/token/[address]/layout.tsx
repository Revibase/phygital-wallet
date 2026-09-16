"use client";

import type { ReactNode } from "react";

import { TokenAddressLayout } from "@/components/token/token-address-layout";
import { RouteBoot } from "@/components/layout/route-boot";
import { Suspense } from "react";

/**
 * Client boundary for `/token/[address]/**`. SSR is enabled — the layout is a
 * client component that hydrates with params from the request.
 */
export default function AddressLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<RouteBoot />}>
      <TokenAddressLayout>{children}</TokenAddressLayout>
    </Suspense>
  );
}
