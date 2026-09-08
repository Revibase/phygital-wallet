import { Hono } from "hono";

import { readBrowseUnlock } from "@/auth/browse-unlock-session";
import { readDeviceSession } from "@/auth/device-session";
import { json } from "@/shared/http";
import { tryParseAddress } from "@/shared/solana/address";
import { getErrorMessage } from "@/shared/utils";
import type { CollectibleAttribute } from "@/tokens/collectible";
import { getCollectibleRarityForMint } from "@/tokens/collection-rarity";
import { fetchVerifiedTokens } from "@/tokens/verified-tokens";
import {
  FEE_BALANCE_LOW_LAMPORTS,
  lamportsToSolUi,
} from "@/fees/constants";
import { tokenSigner } from "@/verifier/token-signer";

/**
 * Server-only token routes (DO fee balance, Jupiter key, rarity index).
 * Portfolio / collectible / shortcuts use the client Solana RPC.
 */
export const tokenRoutes = new Hono<{ Bindings: Env }>();

tokenRoutes.get("/tokens/fee-balance", async (c) => {
  const tokenRaw = c.req.query("phygitalToken")?.trim() ?? "";
  const phygitalToken = tryParseAddress(tokenRaw);
  if (!phygitalToken) {
    return json(
      { error: "Query param phygitalToken must be a valid Solana address" },
      { status: 400 },
    );
  }

  const token = String(phygitalToken);
  const browse = await readBrowseUnlock(c);
  const browseOk = browse?.phygitalToken === token;
  if (!browseOk) {
    const session = await readDeviceSession(c);
    if (
      !session ||
      !(await tokenSigner(c.env, token).isOwner(session.credentialId))
    ) {
      return json(
        {
          error: "Sign in or unlock this item to continue.",
          code: "session_required",
        },
        { status: 401 },
      );
    }
  }

  try {
    const { balanceLamports } = await tokenSigner(c.env, token).getFeeBalance();
    return json({
      balanceLamports: String(balanceLamports),
      balanceUi: lamportsToSolUi(balanceLamports),
      low: balanceLamports < FEE_BALANCE_LOW_LAMPORTS,
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load fee balance",
      },
      { status: 502 },
    );
  }
});

tokenRoutes.get("/tokens/verified", async (c) => {
  try {
    const tokens = await fetchVerifiedTokens();
    return json({ tokens });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load verified tokens",
      },
      { status: 502 },
    );
  }
});

/**
 * Rarity from D1 index. Client supplies mint + collection + attributes from
 * its own DAS `getAsset` (no server RPC).
 */
tokenRoutes.post("/tokens/rarity", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const mintRaw = typeof record?.mint === "string" ? record.mint.trim() : "";
  const collectionRaw =
    typeof record?.collectionMint === "string"
      ? record.collectionMint.trim()
      : "";
  const mint = tryParseAddress(mintRaw);
  const collectionMint = tryParseAddress(collectionRaw);
  if (!mint || !collectionMint) {
    return json(
      { error: "Body must include valid mint and collectionMint addresses" },
      { status: 400 },
    );
  }

  const attributes: CollectibleAttribute[] = [];
  if (Array.isArray(record?.attributes)) {
    for (const row of record.attributes) {
      if (!row || typeof row !== "object") continue;
      const traitType =
        typeof (row as { traitType?: unknown }).traitType === "string"
          ? (row as { traitType: string }).traitType.trim()
          : "";
      const value =
        typeof (row as { value?: unknown }).value === "string"
          ? (row as { value: string }).value.trim()
          : "";
      if (traitType && value) attributes.push({ traitType, value });
    }
  }

  try {
    const rarity = await getCollectibleRarityForMint({
      mint: String(mint),
      collectionMint: String(collectionMint),
      attributes,
    });
    return json({ rarity });
  } catch (error) {
    return json(
      { error: getErrorMessage(error, "Failed to load rarity") },
      { status: 502 },
    );
  }
});
