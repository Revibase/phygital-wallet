import type { Instruction } from "@solana/kit";
import {
  buildPaymentsPolicy,
  type PaymentsPolicyConfig,
} from "phygital-policy";
import type { VerifyFail, VerifyFailDetails } from "phygital-verifier-sdk";
import {
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";
import { COMPUTE_BUDGET_PROGRAM, SYSTEM_PROGRAM } from "@/verifier/constants";
import { getUsdcMint } from "@/tokens/usdc-mint";
import { PHYGITAL_TOKEN_PROGRAM_ADDRESS } from "phygital-token-sdk";

const HARD_DENIED_PROGRAMS = new Set<string>([
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  PHYGITAL_TOKEN_PROGRAM_ADDRESS,
]);

/** Associated Token Account program — create / createIdempotent carry wallet owner. */
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

/** Known USDC mints (mainnet + common devnet) — avoid ALS for UX enrichment. */
const USDC_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDnm3",
]);

function isUsdcMint(mint: string | null | undefined): boolean {
  if (!mint) return false;
  if (USDC_MINTS.has(mint)) return true;
  try {
    return mint === String(getUsdcMint());
  } catch {
    return false;
  }
}

type SoftDetails = VerifyFailDetails & {
  limitUi?: string;
  requestedUi?: string;
  symbol?: string;
};

type PolicyVerdict =
  | { ok: true }
  | {
      ok: false;
      code: string;
      error: string;
      soft: boolean;
      details?: SoftDetails;
    };

function softDeny(
  code: string,
  error: string,
  details: SoftDetails = {},
): PolicyVerdict {
  return { ok: false, code, soft: true, error, details };
}

/**
 * SPL transfer destination is often an ATA. Prefer the wallet owner from a
 * sibling ATA create/createIdempotent that targets the same token account.
 */
function walletOwnerForAta(
  instructions: readonly Instruction[],
  ata: string,
  mint?: string | null,
): string | null {
  for (const ix of instructions) {
    if (String(ix.programAddress) !== ATA_PROGRAM) continue;
    const accounts = ix.accounts ?? [];
    const ataAccount = accounts[1]?.address;
    const wallet = accounts[2]?.address;
    const ixMint = accounts[3]?.address;
    if (!ataAccount || !wallet) continue;
    if (String(ataAccount) !== ata) continue;
    if (mint && ixMint && String(ixMint) !== mint) continue;
    return String(wallet);
  }
  return null;
}

/** Fill owner-facing destination + known symbols from the full instruction set. */
export function enrichSoftDenyDetails(
  details: SoftDetails,
  instructions: readonly Instruction[],
): SoftDetails {
  const mint = typeof details.mint === "string" ? details.mint : null;
  const instructionName =
    typeof details.instructionName === "string"
      ? details.instructionName
      : null;
  const programId =
    typeof details.programId === "string" ? details.programId : null;

  let destination =
    typeof details.destination === "string" ? details.destination : undefined;
  if (destination) {
    const owner = walletOwnerForAta(instructions, destination, mint);
    if (owner) destination = owner;
  }

  let symbol =
    typeof details.symbol === "string" ? details.symbol : undefined;
  if (!symbol) {
    if (isUsdcMint(mint)) {
      symbol = "USDC";
    } else if (
      instructionName === "TransferSol" ||
      instructionName === "transferSol" ||
      (programId === String(SYSTEM_PROGRAM) && !mint)
    ) {
      symbol = "SOL";
    }
  }

  return {
    ...details,
    ...(destination ? { destination } : {}),
    ...(symbol ? { symbol } : {}),
  };
}

function withAmountUi(details: SoftDetails): SoftDetails {
  return details;
}

function mapVerifyFail(fail: VerifyFail): PolicyVerdict {
  const details: SoftDetails = { ...(fail.details ?? {}) };

  if (
    fail.code === "aggregate_limit" ||
    fail.code === "spend_limit"
  ) {
    const spend: SoftDetails = withAmountUi({
      ...details,
      limit: details.limit ?? details.actual,
    });
    return softDeny(
      "spend_limit",
      fail.message.includes("SOL") || details.symbol === "SOL"
        ? "This send is over your SOL spending limit."
        : "This send is over your spending limit.",
      spend,
    );
  }

  let error = fail.message;
  if (fail.code === "program_not_allowed") {
    error = "This payment isn’t allowed by your settings.";
  } else if (
    fail.code === "instruction_not_allowed" ||
    fail.code === "parser_not_found"
  ) {
    error = "This action isn’t allowed by your settings.";
  }
  return softDeny(fail.code, error, withAmountUi(details));
}

/**
 * Strip Compute Budget (wallet injects at send) → hard-deny phygital programs
 * → SDK verify (skipped when `policy` is null — opt-in standing policy) → soft UX map.
 */
export function evaluatePolicy(
  policy: PaymentsPolicyConfig | null,
  instructions: readonly Instruction[],
): PolicyVerdict {
  const body = instructions.filter(
    (ix) => String(ix.programAddress) !== COMPUTE_BUDGET_PROGRAM,
  );

  if (body.length === 0) {
    return {
      ok: false,
      code: "unexpected_instruction",
      soft: false,
      error: "Transaction has no instructions other than Compute Budget.",
    };
  }

  for (const ix of body) {
    if (HARD_DENIED_PROGRAMS.has(String(ix.programAddress))) {
      return {
        ok: false,
        code: "program_not_allowed",
        soft: false,
        error:
          "This instruction targets Phygital Wallet or Token and cannot be approved once.",
        details: { programId: String(ix.programAddress) },
      };
    }
  }

  if (policy == null) return { ok: true };

  const result = buildPaymentsPolicy(policy).verify(body);
  if (result.ok) return { ok: true };

  const verdict = mapVerifyFail(result);
  if (!verdict.ok && verdict.soft) {
    return {
      ...verdict,
      details: enrichSoftDenyDetails(verdict.details ?? {}, body),
    };
  }
  return verdict;
}
