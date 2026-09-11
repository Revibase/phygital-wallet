import { createSolanaRpc, SolanaRpcApi, Rpc } from "@solana/kit";

import { getEnv } from "@/shared/request-context";

type Cluster = "devnet" | "mainnet";

function getCluster(): Cluster {
  const raw = getEnv().SOLANA_CLUSTER?.trim().toLowerCase();
  return raw === "mainnet" ? "mainnet" : "devnet";
}

export function getRpcUrl(): string {
  return (
    getEnv().SOLANA_RPC_URL?.trim() ||
    (getCluster() === "mainnet"
      ? "https://rpc.revibase.com"
      : "https://api.devnet.solana.com")
  );
}

export function isMainnet(): boolean {
  return getCluster() === "mainnet";
}

let cachedRpc: { url: string; rpc: Rpc<SolanaRpcApi> } | null = null;

/** Reuse one Kit RPC client per isolate for a given URL. */
export function getSolanaRpc(): Rpc<SolanaRpcApi> {
  const url = getRpcUrl();
  if (cachedRpc?.url === url) return cachedRpc.rpc;
  const rpc = createSolanaRpc(url);
  cachedRpc = { url, rpc };
  return rpc;
}
