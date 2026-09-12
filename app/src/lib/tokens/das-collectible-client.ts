import { dasGetAsset, dasGetAssetBatch } from "@/lib/solana/das-rpc";
import { collectibleFromDas, type Collectible } from "@/lib/tokens/collectible";

const COLLECTIBLE_DISPLAY = { showCollectionMetadata: true } as const;

export async function fetchDasCollectibleClient(
  mint: string,
): Promise<Collectible | null> {
  const asset = await dasGetAsset(mint, COLLECTIBLE_DISPLAY);
  return collectibleFromDas(asset);
}

export async function fetchDasCollectiblesClient(
  mints: string[],
): Promise<Record<string, Collectible | null>> {
  const unique = [...new Set(mints.map((m) => m.trim()).filter(Boolean))];
  const out: Record<string, Collectible | null> = {};
  if (unique.length === 0) return out;

  if (unique.length === 1) {
    const mint = unique[0]!;
    out[mint] = await fetchDasCollectibleClient(mint);
    return out;
  }

  const assets = await dasGetAssetBatch(unique, COLLECTIBLE_DISPLAY);
  const byId = new Map(assets.map((a) => [a.id?.trim(), a] as const));
  for (const mint of unique) {
    out[mint] = collectibleFromDas(byId.get(mint) ?? null);
  }
  return out;
}
