"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { TokenHomeRenderArgs } from "@/components/token/token-address-route";

export type TokenSessionValue = TokenHomeRenderArgs;

const TokenSessionContext = createContext<TokenSessionValue | null>(null);

export function TokenSessionProvider({
  value,
  children,
}: {
  value: TokenSessionValue;
  children: ReactNode;
}) {
  return (
    <TokenSessionContext.Provider value={value}>
      {children}
    </TokenSessionContext.Provider>
  );
}

/** Unlocked token session from `/token/[address]` layout. Fails closed. */
export function useTokenSession(): TokenSessionValue {
  const ctx = useContext(TokenSessionContext);
  if (!ctx) {
    throw new Error("useTokenSession requires TokenAddressRoute unlock");
  }
  return ctx;
}
