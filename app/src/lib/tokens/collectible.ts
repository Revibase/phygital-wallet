import type { DasAsset } from "@/lib/solana/das-schema";

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
