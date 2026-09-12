"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Coins,
  Home,
  ImageIcon,
  Settings,
} from "lucide-react";

import { CopyableAddress } from "@/components/shared/copyable-address";
import { Button } from "@/components/ui/button";
import { copy } from "@/lib/copy/phygital";
import {
  walletDesktopChromeClass,
  walletDesktopMainClass,
  walletDesktopRailClass,
} from "@/lib/layout";
import { cn } from "@/lib/utils";
import type { Collectible } from "@/lib/tokens/collectible";
import type { WalletGo } from "@/components/wallet/wallet-route-shell";

type WalletSection =
  | "home"
  | "tokens"
  | "collectibles"
  | "activity"
  | "settings"
  | "send"
  | "receive"
  | "other";

const WalletChromeContext = createContext<{ hasRail: true } | null>(null);

/** True inside desktop wallet chrome (rail present from `lg` up). */
export function useWalletChrome() {
  return useContext(WalletChromeContext);
}

function sectionFromPath(
  pathname: string,
  tokenAddress: string,
): WalletSection {
  const base = `/token/${encodeURIComponent(tokenAddress)}/wallet`;
  const normalized = pathname.replace(/\/$/, "") || pathname;
  const baseNorm = base.replace(/\/$/, "");
  if (normalized === baseNorm) return "home";
  if (normalized.includes("/wallet/tokens")) return "tokens";
  if (normalized.includes("/wallet/collectibles")) return "collectibles";
  if (normalized.includes("/wallet/activity")) return "activity";
  if (normalized.includes("/wallet/settings")) return "settings";
  if (normalized.includes("/wallet/send")) return "send";
  if (normalized.includes("/wallet/receive")) return "receive";
  return "other";
}

function RailNavItem({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "h-10 w-full justify-start gap-3 rounded-xl px-3 text-sm font-medium",
        active
          ? "bg-muted/70 text-foreground"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
      )}
    >
      <span className="flex size-5 items-center justify-center [&_svg]:size-4">
        {icon}
      </span>
      {label}
    </Button>
  );
}

/**
 * Desktop-native wallet chrome: sticky left rail + main pane from `lg`.
 * Below `lg`, children render as the existing mobile stack (rail hidden).
 */
export function WalletDesktopChrome({
  pathname,
  tokenAddress,
  walletAddress,
  mint,
  collectible,
  go,
  goCard,
  goSend,
  goHome,
  children,
}: {
  pathname: string;
  tokenAddress: string;
  walletAddress: string;
  mint: string | null;
  collectible: Collectible | null;
  go: (...args: WalletGo) => void;
  goCard: () => void;
  goSend: () => void;
  goHome: () => void;
  children: ReactNode;
}) {
  const section = sectionFromPath(pathname, tokenAddress);
  const label =
    collectible?.name ?? (mint ? copy.home.card : copy.common.wallet);

  return (
    <WalletChromeContext.Provider value={{ hasRail: true }}>
      <div className={walletDesktopChromeClass}>
        <aside
          className={walletDesktopRailClass}
          aria-label={copy.common.wallet}
        >
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={mint ? goCard : goHome}
              className="h-auto min-h-0 w-full items-start justify-start gap-3 rounded-2xl px-2.5 py-2.5 text-left hover:bg-muted/40"
            >
              <span className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-muted">
                {collectible?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={collectible.image}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-sm font-semibold text-muted-foreground">
                    {(label.trim().charAt(0) || "?").toUpperCase()}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block truncate text-sm font-semibold tracking-tight text-foreground">
                  {label}
                </span>
                <CopyableAddress
                  address={walletAddress}
                  length={4}
                  label={copy.address.wallet}
                  className="min-h-0 py-0 text-[11px] text-muted-foreground"
                />
              </span>
            </Button>

            <div className="flex gap-2 px-0.5">
              <Button
                type="button"
                size="sm"
                onClick={() => goSend()}
                className="h-9 flex-1 rounded-full text-xs font-semibold"
              >
                <ArrowUp className="size-3.5" aria-hidden />
                {copy.wallet.send}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => go("receive")}
                className="h-9 flex-1 rounded-full border border-border/50 bg-card/80 text-xs font-semibold"
              >
                <ArrowDown className="size-3.5" aria-hidden />
                {copy.wallet.receive}
              </Button>
            </div>
          </div>

          <nav
            className="flex flex-col gap-0.5"
            aria-label={copy.common.wallet}
          >
            <RailNavItem
              active={section === "home"}
              label={copy.common.wallet}
              icon={<Home />}
              onClick={goHome}
            />
            <RailNavItem
              active={section === "tokens"}
              label={copy.wallet.tokens}
              icon={<Coins />}
              onClick={() => go("tokens")}
            />
            <RailNavItem
              active={section === "collectibles"}
              label={copy.wallet.collectibles}
              icon={<ImageIcon />}
              onClick={() => go("collectibles")}
            />
            <RailNavItem
              active={section === "activity"}
              label={copy.wallet.activity}
              icon={<Clock3 />}
              onClick={() => go("activity")}
            />
            <RailNavItem
              active={section === "settings"}
              label={copy.wallet.settings}
              icon={<Settings />}
              onClick={() => go("settings")}
            />
          </nav>
        </aside>

        <div className={walletDesktopMainClass}>{children}</div>
      </div>
    </WalletChromeContext.Provider>
  );
}
