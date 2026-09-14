import { Hono } from "hono";

import { readBrowseUnlock } from "@/auth/browse-unlock-session";
import { getErrorMessage } from "@/shared/errors";
import { json } from "@/shared/http";
import { tryParseAddress } from "@/shared/solana/address";
import { fetchVerifiedTokens } from "@/tokens/verified-tokens";
import { FEE_BALANCE_LOW_LAMPORTS, lamportsToSolUi } from "@/fees/constants";
import { tokenSigner } from "@/transactions/token-signer";

/**
 * Server-only token routes (DO fee balance, Jupiter verified catalog).
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
    return json(
      { error: "Unlock this item to continue.", code: "session_required" },
      { status: 401 },
    );
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
      { error: getErrorMessage(error, "Failed to load fee balance") },
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
      { error: getErrorMessage(error, "Failed to load verified tokens") },
      { status: 502 },
    );
  }
});
