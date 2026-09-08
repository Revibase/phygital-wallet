import type { Instruction } from "@solana/kit";
import {
  RECIPIENT_ACCOUNT_FIELDS,
  STANDARD_PARSERS,
  createVerifier,
  type PolicyDocument,
  type VerifyFail,
  type VerifyFailDetails,
} from "phygital-verifier-sdk";
import {
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";
import { COMPUTE_BUDGET_PROGRAM, SYSTEM_PROGRAM } from "@/verifier/constants";
import { getUsdcMint } from "@/tokens/usdc-mint";
import { PHYGITAL_TOKEN_PROGRAM_ADDRESS } from "phygital-token-sdk";

const verify = createVerifier({ parsers: [...STANDARD_PARSERS] });

const HARD_DENIED_PROGRAMS = new Set<string>([
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  PHYGITAL_TOKEN_PROGRAM_ADDRESS,
]);

const RECIPIENT_FIELDS = new Set<string>(RECIPIENT_ACCOUNT_FIELDS);

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
      instructionName === "transferSol" ||
      (programId === String(SYSTEM_PROGRAM) && !mint)
    ) {
      symbol = "SOL";
    }
  }

  return {
    ...details,
    ...(destination != null ? { destination } : {}),
    ...(symbol != null ? { symbol } : {}),
  };
}

function enrichSpendDetails(fail: VerifyFail): SoftDetails {
  const details = fail.details ?? {};
  const mint = typeof details.mint === "string" ? details.mint : null;
  const amount = typeof details.amount === "string" ? details.amount : null;
  const limitRaw = details.limit != null ? String(details.limit) : null;
  const isUsdc = isUsdcMint(mint);
  const decimals =
    typeof details.decimals === "number" ? details.decimals : undefined;
  const amountUi =
    typeof details.amountUi === "string"
      ? details.amountUi
      : amount != null && decimals != null
        ? formatRawAmountUi(amount, decimals)
        : undefined;

  return {
    ...details,
    ...(amountUi != null ? { amountUi } : {}),
    // Format USDC caps with the mint decimals from the failed ix (never assume 6).
    limitUi:
      isUsdc && limitRaw != null && decimals != null
        ? formatRawAmountUi(limitRaw, decimals)
        : undefined,
    requestedUi:
      isUsdc && amount != null && decimals != null
        ? formatRawAmountUi(amount, decimals)
        : undefined,
  };
}

function formatRawAmountUi(raw: string, decimals: number): string | undefined {
  if (!/^-?\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0) {
    return undefined;
  }
  try {
    const neg = raw.startsWith("-");
    const abs = BigInt(neg ? raw.slice(1) : raw);
    const base = 10n ** BigInt(decimals);
    const whole = abs / base;
    const frac = (abs % base)
      .toString()
      .padStart(decimals, "0")
      .replace(/0+$/, "");
    const ui = frac.length > 0 ? `${whole}.${frac}` : whole.toString();
    return neg ? `-${ui}` : ui;
  } catch {
    return undefined;
  }
}

/** Prefer human-readable amount for soft-deny UX payloads. */
function withAmountUi(details: SoftDetails): SoftDetails {
  if (typeof details.amountUi === "string") return details;
  const amount = typeof details.amount === "string" ? details.amount : null;
  const decimals =
    typeof details.decimals === "number" ? details.decimals : null;
  if (amount == null || decimals == null) return details;
  const amountUi = formatRawAmountUi(amount, decimals);
  return amountUi != null ? { ...details, amountUi } : details;
}

/** Map SDK verify failure → Revibase soft UX codes / copy. */
function mapVerifyFail(fail: VerifyFail): PolicyVerdict {
  const details = fail.details ?? {};
  const mint = typeof details.mint === "string" ? details.mint : null;
  const instructionName =
    typeof details.instructionName === "string"
      ? details.instructionName
      : null;

  if (
    instructionName === "transferChecked" &&
    mint != null && !isUsdcMint(mint)
  ) {
    return softDeny(
      "approval_required",
      "Non-USDC token sends need a one-time approval.",
      withAmountUi(details),
    );
  }

  if (fail.code === "instruction_denied") {
    return softDeny(
      "recipient_denied",
      "Transfers to this address are blocked.",
      withAmountUi(details),
    );
  }

  if (
    fail.code === "instruction_not_allowed" &&
    ((typeof details.field === "string" && RECIPIENT_FIELDS.has(details.field)) ||
      details.op === "in")
  ) {
    return softDeny(
      "recipient_not_allowed",
      "This address isn’t on your allowed list.",
      withAmountUi(details),
    );
  }

  if (fail.code === "spend_limit") {
    const spend = enrichSpendDetails(fail);
    const limitUi = spend.limitUi;
    return softDeny(
      "spend_limit",
      typeof limitUi === "string"
        ? `This send is over your $${limitUi.replace(/\.00$/, "")} limit.`
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
  policy: PolicyDocument | null,
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

  const result = verify(policy, body);
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
