"use client";

import { usePhygitalTokenByAddress } from "@/hooks/token/use-phygital-token";
import { useResolvedDasCollectible } from "@/hooks/token/use-das-collectible";
import { copy } from "@/lib/copy/phygital";
import { tokenHasLinkedMint } from "@/lib/phygital/token";
import { shortAddress } from "@/lib/utils";

/** Display name + art for Hold / mismatch recovery (DAS name → short address). */
export function useAccessoryHoldLabel(phygitalTokenPda: string | null) {
  const tokenQuery = usePhygitalTokenByAddress(phygitalTokenPda);
  const mint =
    tokenQuery.data && tokenHasLinkedMint(tokenQuery.data)
      ? String(tokenQuery.data.mint)
      : null;
  const { collectible, loading: artLoading } = useResolvedDasCollectible(mint, {
    enabled: Boolean(mint),
  });

  const name =
    collectible?.name?.trim() ||
    (phygitalTokenPda
      ? shortAddress(phygitalTokenPda, 4)
      : copy.home.accessory);
  const imageSrc = collectible?.image ?? null;
  const loading =
    Boolean(phygitalTokenPda) &&
    (tokenQuery.isPending || (Boolean(mint) && artLoading));

  return { name, imageSrc, loading };
}
