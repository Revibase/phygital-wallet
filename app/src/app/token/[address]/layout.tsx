"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { RouteBoot } from "@/components/layout/route-boot";

/** Client-only so wallet UI never SSR past the browse unlock gate. */
const TokenAddressLayout = dynamic(
  () =>
    import("@/components/token/token-address-layout").then(
      (m) => m.TokenAddressLayout,
    ),
  { ssr: false, loading: () => <RouteBoot /> },
);

export default function AddressLayout({ children }: { children: ReactNode }) {
  return <TokenAddressLayout>{children}</TokenAddressLayout>;
}
