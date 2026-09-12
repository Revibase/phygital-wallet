/**
 * Client DAS JSON-RPC against the configured Solana RPC.
 * Keep `postDasRpc` / `postDasRpcBatch` in sync with `api/src/tokens/das-rpc.ts`.
 */

import { getSolanaRpcUrl } from "@/lib/solana/cluster";
import type {
  DasAsset,
  DasAssetList,
  DasAssetProof,
  DasDisplayOptions,
} from "@/lib/solana/das-schema";

type DasJsonRpcBody<T> = {
  result?: T;
  error?: { message?: string };
  id?: string | number;
};

type DasRpcCall = {
  method: string;
  params: unknown;
  id: string;
};

async function postDasRpc<T>(args: DasRpcCall): Promise<T | undefined> {
  const res = await fetch(getSolanaRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: args.id,
      method: args.method,
      params: args.params,
    }),
  });
  if (!res.ok) {
    throw new Error(`${args.method} RPC failed (${res.status})`);
  }
  const body = (await res.json()) as DasJsonRpcBody<T>;
  if (body.error?.message) {
    throw new Error(body.error.message);
  }
  return body.result;
}

/** Multiple DAS methods in one HTTP round-trip. */
export async function postDasRpcBatch<T extends unknown[]>(calls: {
  [K in keyof T]: DasRpcCall;
}): Promise<{ [K in keyof T]: T[K] | undefined }> {
  if (calls.length === 0) {
    return [] as { [K in keyof T]: T[K] | undefined };
  }
  if (calls.length === 1) {
    const only = calls[0]!;
    const result = await postDasRpc<T[0]>(only);
    return [result] as { [K in keyof T]: T[K] | undefined };
  }

  const res = await fetch(getSolanaRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      calls.map((c) => ({
        jsonrpc: "2.0",
        id: c.id,
        method: c.method,
        params: c.params,
      }))
    ),
  });
  if (!res.ok) {
    throw new Error(`DAS batch RPC failed (${res.status})`);
  }
  const bodies = (await res.json()) as DasJsonRpcBody<unknown>[];
  if (!Array.isArray(bodies)) {
    throw new Error("DAS batch RPC returned a non-array body");
  }
  const byId = new Map<string | number, DasJsonRpcBody<unknown>>();
  for (const body of bodies) {
    if (body.id !== undefined) byId.set(body.id, body);
  }
  return calls.map((c) => {
    const body = byId.get(c.id);
    if (!body) throw new Error(`Missing DAS batch result for id=${c.id}`);
    if (body.error?.message) throw new Error(body.error.message);
    return body.result as T[number] | undefined;
  }) as { [K in keyof T]: T[K] | undefined };
}

export async function dasGetAssetsByOwner(args: {
  ownerAddress: string;
  page?: number;
  limit?: number;
  displayOptions?: DasDisplayOptions;
}): Promise<DasAssetList> {
  const result = await postDasRpc<DasAssetList>({
    method: "getAssetsByOwner",
    id: "getAssetsByOwner",
    params: {
      ownerAddress: args.ownerAddress,
      page: args.page ?? 1,
      limit: args.limit ?? 1000,
      displayOptions: args.displayOptions,
    },
  });
  return {
    total: result?.total ?? 0,
    limit: result?.limit ?? 0,
    page: result?.page,
    cursor: result?.cursor,
    items: Array.isArray(result?.items) ? result.items : [],
    nativeBalance: result?.nativeBalance,
  };
}

export async function dasGetAsset(
  id: string,
  displayOptions?: DasDisplayOptions
): Promise<DasAsset | null> {
  try {
    const result = await postDasRpc<DasAsset | null>({
      method: "getAsset",
      id: "getAsset",
      params: { id, displayOptions },
    });
    return result ?? null;
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

export async function dasGetAssetBatch(
  ids: string[],
  displayOptions?: DasDisplayOptions
): Promise<DasAsset[]> {
  if (ids.length === 0) return [];
  const result = await postDasRpc<DasAsset[]>({
    method: "getAssetBatch",
    id: "getAssetBatch",
    params: { ids, displayOptions },
  });
  return Array.isArray(result) ? result : [];
}

export type { DasAssetProof };

export async function dasGetAssetProof(
  assetId: string
): Promise<DasAssetProof> {
  const result = await postDasRpc<DasAssetProof>({
    method: "getAssetProof",
    id: "getAssetProof",
    params: { id: assetId },
  });
  if (!result) throw new Error("getAssetProof returned no result");
  return result;
}

/** getAsset + getAssetProof in one HTTP round-trip (cNFT transfers). */
export async function dasGetAssetWithProof(assetId: string): Promise<{
  asset: DasAsset;
  proof: DasAssetProof;
}> {
  const [asset, proof] = await postDasRpcBatch<[DasAsset, DasAssetProof]>([
    {
      method: "getAsset",
      id: "getAsset",
      params: { id: assetId },
    },
    {
      method: "getAssetProof",
      id: "getAssetProof",
      params: { id: assetId },
    },
  ]);
  if (!asset?.id) throw new Error("getAsset returned no asset");
  if (!proof) throw new Error("getAssetProof returned no proof");
  return { asset, proof };
}
