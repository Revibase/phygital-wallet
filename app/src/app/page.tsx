import type { Metadata } from "next";
import { Suspense } from "react";

import { OwnerHome } from "@/components/home/owner-home";
import { RouteBoot } from "@/components/layout/route-boot";
import { products } from "@/lib/copy/phygital";

export const metadata: Metadata = {
  title: products.home.name,
  description: products.home.tagline,
};

export default function Home() {
  return (
    <Suspense fallback={<RouteBoot layout="home" />}>
      <OwnerHome />
    </Suspense>
  );
}
