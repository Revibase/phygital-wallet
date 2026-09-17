/**
 * Fee-payer HTTP surface: `GET /getFeePayer`, `POST /sign`.
 * Policy is enforced on-chain.
 */
import { Hono } from "hono";

import { feePayerRoutes } from "@/transactions/fee-payer";
import { signRoutes } from "@/transactions/sign";

export const transactions = new Hono();

transactions.route("/", feePayerRoutes);
transactions.route("/", signRoutes);
