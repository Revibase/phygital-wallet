"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/** Collectible identity — title and collection. */
export function CollectibleHeader({
  name,
  collectionName,
  collectionImage,
  className,
}: {
  name: string;
  collectionName?: string | null;
  collectionImage?: string | null;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showCollectionImage = Boolean(collectionImage) && !imageFailed;

  return (
    <div className={cn("flex w-full flex-col gap-2 text-left", className)}>
      <h1 className="wrap-break-word text-display-xl tracking-tight text-foreground md:text-[1.75rem] lg:text-3xl">
        {name}
      </h1>
      {collectionName || showCollectionImage ? (
        <div className="inline-flex min-w-0 items-center gap-1.5">
          {showCollectionImage ? (
            // DAS collection logos are remote https URLs.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={collectionImage!}
              alt=""
              width={16}
              height={16}
              className="size-4 shrink-0 rounded-sm object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : null}
          {collectionName ? (
            <p className="truncate text-sm text-muted-foreground">
              {collectionName}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
