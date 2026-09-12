import { shortAddress } from "@/lib/utils";
import type { DasAsset, DasContent } from "@/lib/solana/das-schema";

export type CollectibleAttribute = {
  traitType: string;
  value: string;
};

/** Lean collectible for minted `/token` UI — not a payment (fungible) token. */
export type Collectible = {
  mint: string;
  name: string;
  image: string | null;
  collectionName: string | null;
  /** Collection logo (https only). */
  collectionImage: string | null;
  collectionDescription: string | null;
  collectionMint: string | null;
  description: string | null;
  attributes: CollectibleAttribute[];
  externalUrl: string | null;
  /** SPL NFT holder. */
  mintOwner: string | null;
};

/** Mint address fallback when metadata has no name or image. */
export function fallbackCollectible(mint: string): Collectible {
  return {
    mint,
    name: shortAddress(mint),
    image: null,
    collectionName: null,
    collectionImage: null,
    collectionDescription: null,
    collectionMint: null,
    description: null,
    attributes: [],
    externalUrl: null,
    mintOwner: null,
  };
}

function firstHttpsUrl(
  ...candidates: Array<string | undefined>
): string | null {
  for (const raw of candidates) {
    const url = raw?.trim();
    if (url?.startsWith("https://")) return url;
  }
  return null;
}

/** HTTPS image from DAS files, then `links.image`. */
export function dasAssetImage(asset: DasAsset): string | null {
  for (const file of asset.content?.files ?? []) {
    const url = firstHttpsUrl(file.cdn_uri, file.uri);
    if (url) return url;
  }
  return firstHttpsUrl(asset.content?.links?.image);
}

export function mapAttributesFromDasContent(
  raw: DasContent | undefined
): CollectibleAttribute[] {
  const list = raw?.metadata?.attributes;
  if (!Array.isArray(list) || list.length === 0) return [];

  const out: CollectibleAttribute[] = [];
  for (const item of list) {
    const extra = item as typeof item & { traitType?: string };
    const traitType = (item.trait_type ?? extra.traitType)?.trim();
    if (!traitType) continue;
    if (item.value === undefined || item.value === null) continue;
    const value = String(item.value).trim();
    if (!value) continue;
    out.push({ traitType, value });
  }
  return out;
}

/** Map DAS `getAsset` → collectible, or null when neither name nor image. */
export function collectibleFromDas(
  asset: DasAsset | null | undefined
): Collectible | null {
  if (!asset) return null;
  const mint = asset.id?.trim();
  if (!mint) return null;

  const name = asset.content?.metadata?.name?.trim() || "";
  const image = dasAssetImage(asset);
  if (!name && !image) return null;

  const collection = asset.grouping?.find((g) => g.group_key === "collection");

  return {
    mint,
    name: name || shortAddress(mint),
    image,
    collectionName: collection?.collection_metadata?.name?.trim() || null,
    collectionImage: firstHttpsUrl(collection?.collection_metadata?.image),
    collectionDescription:
      collection?.collection_metadata?.description?.trim() || null,
    collectionMint: collection?.group_value?.trim() || null,
    description: asset.content?.metadata?.description?.trim() || null,
    attributes: mapAttributesFromDasContent(asset.content),
    externalUrl: firstHttpsUrl(asset.content?.links?.external_url),
    mintOwner: asset.ownership?.owner?.trim() || null,
  };
}
