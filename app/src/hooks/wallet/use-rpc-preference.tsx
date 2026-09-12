"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { copy } from "@/lib/copy/phygital";
import { invalidateRpcDependentQueries } from "@/lib/queries";
import {
  DEFAULT_RPC_PREFERENCE,
  displayRpcEndpoint,
  getDefaultRpcUrl,
  isValidRpcUrl,
  readRpcPreference,
  resolveSolanaRpcUrl,
  writeRpcPreference,
  type RpcPreference,
} from "@/lib/solana/rpc-preference";
import { resetSolanaRpcClients } from "@/lib/solana/rpc";

const RPC_PREF_EVENT = "phygital-wallet:rpc-preference";

function subscribeRpcPreference(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onStoreChange();
  window.addEventListener(RPC_PREF_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(RPC_PREF_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function getRpcPreferenceSnapshot(): RpcPreference {
  return readRpcPreference();
}

function getServerSnapshot(): RpcPreference {
  return DEFAULT_RPC_PREFERENCE;
}

function notifyRpcPreferenceChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RPC_PREF_EVENT));
}

type RpcPreferenceContextValue = {
  preference: RpcPreference;
  rpcUrl: string;
  isCustom: boolean;
  displayEndpoint: string | null;
  defaultRpcUrl: string;
  setDefault: () => void;
  setCustom: (url: string) => void;
};

const RpcPreferenceContext = createContext<RpcPreferenceContextValue | null>(
  null
);

export function RpcPreferenceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const preference = useSyncExternalStore(
    subscribeRpcPreference,
    getRpcPreferenceSnapshot,
    getServerSnapshot
  );

  const setDefault = useCallback(() => {
    writeRpcPreference({ mode: "default" });
    resetSolanaRpcClients();
    notifyRpcPreferenceChanged();
    invalidateRpcDependentQueries(queryClient);
  }, [queryClient]);

  const setCustom = useCallback(
    (url: string) => {
      const trimmed = url.trim();
      if (!isValidRpcUrl(trimmed)) {
        throw new Error(copy.wallet.rpcInvalidUrl);
      }
      writeRpcPreference({ mode: "custom", url: trimmed });
      resetSolanaRpcClients();
      notifyRpcPreferenceChanged();
      invalidateRpcDependentQueries(queryClient);
    },
    [queryClient]
  );

  const value = useMemo((): RpcPreferenceContextValue => {
    const rpcUrl = resolveSolanaRpcUrl(preference);
    const isCustom = preference.mode === "custom";
    return {
      preference,
      rpcUrl,
      isCustom,
      displayEndpoint: isCustom ? displayRpcEndpoint(rpcUrl) : null,
      defaultRpcUrl: getDefaultRpcUrl(),
      setDefault,
      setCustom,
    };
  }, [preference, setCustom, setDefault]);

  return (
    <RpcPreferenceContext.Provider value={value}>
      {children}
    </RpcPreferenceContext.Provider>
  );
}

export function useRpcPreference(): RpcPreferenceContextValue {
  const ctx = useContext(RpcPreferenceContext);
  if (!ctx) {
    throw new Error(
      "useRpcPreference must be used within RpcPreferenceProvider"
    );
  }
  return ctx;
}
