import type {
  PaymentToken,
  PaymentTokenHolding,
} from "@/lib/tokens/payment-token";
import { NATIVE_SOL_TOKEN_PROGRAM } from "@/lib/tokens/payment-token";
import { DasInterface } from "@/lib/solana/das-schema";
import type { WalletCollectible } from "@/lib/wallet/portfolio-types";

type SendAssetKind = "native" | "fungible" | "nft" | "pnft" | "cnft" | "core";

export type SendAssetRef = {
  kind: SendAssetKind;
  mint: string;
  decimals: number;
  tokenProgram: string | null;
  symbol: string;
  name: string;
  icon: string | null;
};

export function isCollectibleSendKind(kind: SendAssetKind): boolean {
  return (
    kind === "nft" || kind === "pnft" || kind === "cnft" || kind === "core"
  );
}

function holdingToSendKind(h: { tokenProgram?: string | null }): SendAssetKind {
  return h.tokenProgram === NATIVE_SOL_TOKEN_PROGRAM ? "native" : "fungible";
}

function collectibleToSendKind(c: {
  interface: string;
  compressed: boolean;
}): SendAssetKind {
  if (c.compressed) return "cnft";
  if (c.interface === DasInterface.PROGRAMMABLE_NFT) return "pnft";
  if (c.interface === DasInterface.MPL_CORE_ASSET) return "core";
  return "nft";
}

export function paymentTokenToSendAsset(t: PaymentToken): SendAssetRef {
  return {
    kind: holdingToSendKind(t),
    mint: t.mint,
    decimals: t.decimals,
    tokenProgram: t.tokenProgram,
    symbol: t.symbol,
    name: t.name,
    icon: t.icon,
  };
}

export function holdingToSendAsset(h: PaymentTokenHolding): SendAssetRef {
  return {
    kind: holdingToSendKind(h),
    mint: h.mint,
    decimals: h.decimals,
    tokenProgram: h.tokenProgram ?? null,
    symbol: h.symbol,
    name: h.name,
    icon: h.icon,
  };
}

export function collectibleToSendAsset(c: WalletCollectible): SendAssetRef {
  return {
    kind: collectibleToSendKind(c),
    mint: c.mint,
    decimals: 0,
    tokenProgram: c.tokenProgram,
    symbol: c.name,
    name: c.name,
    icon: c.image,
  };
}

export function collectibleInterfaceLabel(c: {
  interface: string;
  compressed: boolean;
}): string {
  switch (collectibleToSendKind(c)) {
    case "cnft":
      return "cNFT";
    case "pnft":
      return "pNFT";
    case "core":
      return "Core";
    default:
      return "NFT";
  }
}
