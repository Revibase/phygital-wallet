"use client";

import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import type { ShellLayout } from "@/lib/layout";

export function TokenRouteShell({
  children,
  layout = "compact",
}: {
  children?: ReactNode;
  layout?: ShellLayout;
}) {
  return <AppShell layout={layout}>{children}</AppShell>;
}
