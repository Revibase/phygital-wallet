"use client";

import { useMemo, useState, type ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  HeliusWalletProvider,
  type HeliusWalletConfig,
} from "helius-wallet-kit";

import { Toaster } from "@/components/ui/sonner";
import { isMainnet } from "@/lib/solana/cluster";
import { useResumeQueryRefresh } from "@/hooks/layout/use-resume-query-refresh";
import { RpcPreferenceProvider } from "@/hooks/wallet/use-rpc-preference";
import {
  CACHE_BUSTER,
  QUERY_CACHE_MAX_AGE_MS,
  createQueryPersister,
  shouldDehydrateQuery,
} from "@/lib/queries/persist";
import { queryOptions, shouldRetryQuery } from "@/lib/queries";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            ...queryOptions.default,
            gcTime: QUERY_CACHE_MAX_AGE_MS,
            retry: shouldRetryQuery,
          },
          mutations: {
            retry: shouldRetryQuery,
          },
        },
      })
  );
  const [persister] = useState(() => createQueryPersister());

  // Key-less: the API key stays server-side behind `/api/helius/*`.
  const heliusConfig = useMemo<HeliusWalletConfig>(
    () => ({ cluster: isMainnet() ? "mainnet-beta" : "devnet" }),
    []
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: QUERY_CACHE_MAX_AGE_MS,
        buster: CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery },
      }}
    >
      <HeliusWalletProvider config={heliusConfig}>
        <RpcPreferenceProvider>
          <ResumeQueryRefresh />
          {children}
          <Toaster
            richColors
            position="top-center"
            offset="max(12px, env(safe-area-inset-top))"
          />
        </RpcPreferenceProvider>
      </HeliusWalletProvider>
    </PersistQueryClientProvider>
  );
}

/** Must render under PersistQueryClientProvider (`useQueryClient`). */
function ResumeQueryRefresh() {
  useResumeQueryRefresh();
  return null;
}
