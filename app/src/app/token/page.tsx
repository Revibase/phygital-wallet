import type { Metadata } from "next";
import { Suspense } from "react";

import { RouteBoot } from "@/components/layout/route-boot";
import { TokenApp } from "@/components/token/token-app";
import { products } from "@/lib/copy/phygital";

export const metadata: Metadata = {
  title: products.token.name,
  description: products.token.tagline,
};

export default function TokenPage() {
  return (
    <Suspense fallback={<RouteBoot />}>
      <TokenApp />
    </Suspense>
  );
}
