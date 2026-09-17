/** GET /getFeePayer — public default fee-payer pubkey. */
import { Hono } from "hono";

import { json } from "@/shared/http";

export const feePayerRoutes = new Hono<{ Bindings: Env }>();

feePayerRoutes.get("/getFeePayer", (c) => {
  let pubkeys: unknown;
  try {
    pubkeys = JSON.parse(c.env.DEFAULT_FEE_PAYER_PUBKEYS);
  } catch {
    pubkeys = null;
  }
  const feePayer =
    Array.isArray(pubkeys) && typeof pubkeys[0] === "string"
      ? pubkeys[0]
      : null;
  if (!feePayer) {
    return json(
      { error: "Fee payer is not configured", code: "signer_misconfigured" },
      { status: 500 }
    );
  }
  return json({ feePayer });
});
