"use client";

import { useState, type ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";

import { Toaster } from "@/components/ui/sonner";
import { PasskeySetupProvider } from "@/components/wallet/passkey-setup-sheet";
import { SecureSignerHost } from "@/components/wallet/secure-signer-host";
import { useResumeQueryRefresh } from "@/hooks/layout/use-resume-query-refresh";
import { OwnerWalletProvider } from "@/hooks/wallet/use-owner-wallet";
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
      }),
  );
  const [persister] = useState(() => createQueryPersister());

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
      <RpcPreferenceProvider>
        <PasskeySetupProvider>
          <SecureSignerHost />
          <OwnerWalletProvider>
            <ResumeQueryRefresh />
            {children}
            <Toaster
              richColors
              position="top-center"
              offset="max(12px, env(safe-area-inset-top))"
            />
          </OwnerWalletProvider>
        </PasskeySetupProvider>
      </RpcPreferenceProvider>
    </PersistQueryClientProvider>
  );
}

/** Must render under PersistQueryClientProvider (`useQueryClient`). */
function ResumeQueryRefresh() {
  useResumeQueryRefresh();
  return null;
}
