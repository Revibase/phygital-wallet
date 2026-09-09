import { fetchDasCollectibleClient } from "@/lib/tokens/das-collectible-client";
import type { Collectible } from "@/lib/tokens/collectible";
import {
  fetchCollectibleShortcuts,
  type CollectibleShortcut,
} from "@/lib/tokens/shortcuts";

export type MintedCollectibleView = {
  collectible: Collectible | null;
  shortcuts: CollectibleShortcut[];
};

/** Minted landing: DAS collectible + shortcuts (client RPC / browser). */
export async function fetchMintedCollectibleViewClient(
  mint: string,
): Promise<MintedCollectibleView> {
  const collectible = await fetchDasCollectibleClient(mint);
  if (!collectible) {
    return { collectible: null, shortcuts: [] };
  }

  const shortcuts = collectible.externalUrl
    ? await fetchCollectibleShortcuts(
        collectible.externalUrl,
        collectible.collectionMint,
      )
    : [];

  return { collectible, shortcuts };
}
