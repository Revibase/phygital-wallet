"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys, queryOptions } from "@/lib/queries";
import {
  fetchAccessorySession,
  type AccessorySessionMode,
} from "@/lib/wallet/owner-session";

export type { AccessorySessionMode as WalletSessionMode };

/** Admit mode for this PDA: owner-browse vs NFC browse_unlock. */
export function useWalletSessionMode(phygitalToken: string | null) {
  return useQuery({
    queryKey: queryKeys.accessorySession.byToken(phygitalToken),
    enabled: Boolean(phygitalToken),
    queryFn: async (): Promise<AccessorySessionMode | null> => {
      const session = await fetchAccessorySession();
      if (!session.mode || !session.phygitalToken) return null;
      if (session.phygitalToken !== phygitalToken) return null;
      return session.mode;
    },
    ...queryOptions.default,
  });
}
