import type { Metadata } from "next";
import Link from "next/link";

import { RevibaseMark } from "@/components/brand/revibase-mark";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { brand, copy } from "@/lib/copy/phygital";
import {
  centeredBlockClass,
  copyBlockClass,
  ctaBlockClass,
} from "@/lib/layout";
import { galleryAnimate } from "@/lib/motion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: copy.common.notFoundTitle,
  description: copy.common.notFoundBody,
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <AppShell layout="compact">
      <div className={cn(centeredBlockClass, "gap-6")}>
        <div className={cn(galleryAnimate.rise)} aria-hidden>
          <RevibaseMark
            variant="digital"
            className="size-12 opacity-90"
            title={brand.company}
          />
        </div>
        <div className={cn(copyBlockClass, "space-y-2", galleryAnimate.rise)}>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            404
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {copy.common.notFoundTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {copy.common.notFoundBody}
          </p>
        </div>
        <div className={cn(ctaBlockClass, galleryAnimate.rise)}>
          <Button type="button" size="lg" className="w-full" asChild>
            <Link href="/">{copy.common.goHome}</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
