import { formatTokenAmount } from "@/lib/tokens/amount";
import { dasAssetImage } from "@/lib/tokens/collectible";
import {
  NATIVE_SOL_MINT,
  nativeSolHolding,
  type PaymentTokenHolding,
} from "@/lib/tokens/payment-token";
import {
  isDasCollectibleInterface,
  isDasFungible,
  type DasAsset,
  type DasAssetList,
} from "@/lib/solana/das-schema";
import { dasGetAssetsByOwner, postDasRpcBatch } from "@/lib/solana/das-rpc";
import type { WalletCollectible } from "@/lib/wallet/portfolio-types";

const DAS_PAGE_SIZE = 200;
const DAS_MAX_PAGES = 5;

function buildFungibleHoldings(assets: DasAsset[]): PaymentTokenHolding[] {
  const holdings: PaymentTokenHolding[] = [];
  const seen = new Set<string>();

  for (const asset of assets) {
    if (!isDasFungible(asset.interface)) continue;
    const mint = asset.id?.trim();
    if (!mint || seen.has(mint)) continue;
    if (mint === NATIVE_SOL_MINT) continue;

    const tokenInfo = asset.token_info;
    const decimals =
      typeof tokenInfo?.decimals === "number" ? tokenInfo.decimals : 0;
    const balanceRaw = BigInt(
      tokenInfo?.balance != null ? String(tokenInfo.balance) : "0"
    );
    if (balanceRaw <= 0n) continue;

    seen.add(mint);
    const priceInfo = tokenInfo?.price_info;
    const pricePerTokenUsd =
      typeof priceInfo?.price_per_token === "number"
        ? priceInfo.price_per_token
        : null;
    const totalPriceUsd =
      typeof priceInfo?.total_price === "number" ? priceInfo.total_price : null;
    const balanceUi = formatTokenAmount(balanceRaw, decimals);

    holdings.push({
      mint,
      symbol: tokenInfo?.symbol || asset.content?.metadata?.symbol || "-",
      name: asset.content?.metadata?.name || "Unknown",
      icon: dasAssetImage(asset),
      decimals,
      tokenProgram: tokenInfo?.token_program,
      balanceRaw: balanceRaw.toString(),
      balanceUi,
      pricePerTokenUsd,
      valueUsd:
        totalPriceUsd ??
        (pricePerTokenUsd != null
          ? Number(balanceUi) * pricePerTokenUsd
          : null),
    });
  }

  holdings.sort((a, b) => {
    const aBal = BigInt(a.balanceRaw);
    const bBal = BigInt(b.balanceRaw);
    if (aBal === bBal) return 0;
    return aBal > bBal ? -1 : 1;
  });
  return holdings;
}

function buildCollectibles(assets: DasAsset[]): WalletCollectible[] {
  const out: WalletCollectible[] = [];
  for (const asset of assets) {
    if (isDasFungible(asset.interface) || !asset.id) continue;

    const iface = asset.interface ?? "";
    const image = dasAssetImage(asset);
    if (
      !isDasCollectibleInterface(iface) &&
      !image &&
      !asset.content?.metadata?.name
    ) {
      continue;
    }

    const group = asset.grouping?.find((g) => g.group_key === "collection");

    out.push({
      mint: asset.id,
      name: asset.content?.metadata?.name?.trim() || "Unknown",
      image,
      collectionName: group?.collection_metadata?.name?.trim() || null,
      interface: iface || "Unknown",
      compressed: Boolean(asset.compression?.compressed),
      tokenProgram: asset.token_info?.token_program ?? null,
    });
  }
  return out;
}

async function fetchOwnerAssets(owner: string): Promise<{
  items: DasAsset[];
  nativeBalanceLamports: bigint;
  nativeBalancePricePerSolUsd: number | null;
  nativeBalanceTotalPriceUsd: number | null;
}> {
  const displayOptions = {
    showFungible: true,
    showNativeBalance: true,
    showCollectionMetadata: true,
  } as const;

  const first = await dasGetAssetsByOwner({
    ownerAddress: owner,
    page: 1,
    limit: DAS_PAGE_SIZE,
    displayOptions,
  });
  const items = [...first.items];
  const total = first.total ?? items.length;
  const nativeBalancePricePerSolUsd =
    typeof first.nativeBalance?.price_per_sol === "number"
      ? first.nativeBalance.price_per_sol
      : null;
  const nativeBalanceTotalPriceUsd =
    typeof first.nativeBalance?.total_price === "number"
      ? first.nativeBalance.total_price
      : null;
  const pagesNeeded = Math.min(
    DAS_MAX_PAGES,
    Math.max(1, Math.ceil(total / DAS_PAGE_SIZE))
  );
  if (items.length < DAS_PAGE_SIZE || pagesNeeded <= 1) {
    return {
      items,
      nativeBalanceLamports: BigInt(first.nativeBalance?.lamports ?? 0),
      nativeBalancePricePerSolUsd,
      nativeBalanceTotalPriceUsd,
    };
  }

  const extra = await postDasRpcBatch<DasAssetList[]>(
    Array.from({ length: pagesNeeded - 1 }, (_, i) => ({
      method: "getAssetsByOwner",
      id: `getAssetsByOwner-${i + 2}`,
      params: {
        ownerAddress: owner,
        page: i + 2,
        limit: DAS_PAGE_SIZE,
        displayOptions: {
          showFungible: true,
          showCollectionMetadata: true,
        },
      },
    }))
  );
  for (const page of extra) {
    const pageItems = Array.isArray(page?.items) ? page.items : [];
    items.push(...pageItems);
    if (pageItems.length < DAS_PAGE_SIZE) break;
  }

  return {
    items,
    nativeBalanceLamports: BigInt(first.nativeBalance?.lamports ?? 0),
    nativeBalancePricePerSolUsd,
    nativeBalanceTotalPriceUsd,
  };
}

/** Portfolio via the user's Solana RPC (DAS `getAssetsByOwner`). */
export async function fetchWalletPortfolioFromDas(owner: string): Promise<{
  holdings: PaymentTokenHolding[];
  collectibles: WalletCollectible[];
}> {
  const {
    items,
    nativeBalanceLamports,
    nativeBalancePricePerSolUsd,
    nativeBalanceTotalPriceUsd,
  } = await fetchOwnerAssets(owner);
  const holdings = buildFungibleHoldings(items);
  if (nativeBalanceLamports > 0n) {
    holdings.unshift(
      nativeSolHolding(
        nativeBalanceLamports,
        formatTokenAmount(nativeBalanceLamports, 9),
        nativeBalancePricePerSolUsd,
        nativeBalanceTotalPriceUsd
      )
    );
  }

  return {
    holdings,
    collectibles: buildCollectibles(items),
  };
}
