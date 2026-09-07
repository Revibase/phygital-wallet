/**
 * Revibase co-signer: POST `/preview` + POST `/sign`.
 *
 * `/sign` proxies to TokenSigner. Config txs (token verifier / recovery wallet)
 * run the fee gate first; owner WebAuthn is required only when the co-signer is
 * a Config default verifier. `execute` uses fee + policy.
 *
 * Instruction policy is authored with **`phygital-verifier-sdk`**.
 * This folder is the Worker HTTP + D1 approval surface, not a fork template.
 */
import { Hono } from "hono";

import { previewRoutes } from "@/verifier/preview";
import { signRoutes } from "@/verifier/sign";

export const verifierRoutes = new Hono();

verifierRoutes.route("/", previewRoutes);
verifierRoutes.route("/", signRoutes);
