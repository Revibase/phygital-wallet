/**
 * Revibase paymaster + owner-connect HTTP surface.
 *
 * - GET  `/getFeePayer` — the default fee-payer pubkey the SDK builds txs against.
 * - POST `/sign` — fee-sponsor an on-chain `execute` (fee-balance + shape gate).
 *
 * Policy is enforced on-chain; there is no `/preview` or `/policies` here.
 */
import { Hono } from "hono";

import { feePayerRoutes } from "@/transactions/fee-payer";
import { signRoutes } from "@/transactions/sign";

export const transactions = new Hono();

transactions.route("/", feePayerRoutes);
transactions.route("/", signRoutes);
