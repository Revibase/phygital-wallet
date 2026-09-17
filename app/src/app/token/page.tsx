import type { Metadata } from "next";

import { TokenApp } from "@/components/token/token-app";
import { products } from "@/lib/copy/phygital";

export const metadata: Metadata = {
  title: products.token.name,
  description: products.token.tagline,
};

export default function TokenPage() {
  return <TokenApp />;
}
