import {
  RECIPIENT_ACCOUNT_FIELDS,
  STANDARD_PARSERS,
  createVerifier,
  type Instruction,
  type PolicyDocument,
  type VerifyFail,
  type VerifyFailDetails,
} from "phygital-verifier-sdk";
import {
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
} from "phygital-wallet-sdk";
import { COMPUTE_BUDGET_PROGRAM } from "@/verifier/constants";
import { getUsdcMint, USDC_DECIMALS } from "@/tokens/usdc-mint";
import { PHYGITAL_TOKEN_PROGRAM_ADDRESS } from "phygital-token-sdk";

const verify = createVerifier({ parsers: [...STANDARD_PARSERS] });

const HARD_DENIED_PROGRAMS = new Set<string>([
  PHYGITAL_WALLET_PROGRAM_ADDRESS,
  PHYGITAL_TOKEN_PROGRAM_ADDRESS,
]);

const RECIPIENT_FIELDS = new Set<string>(RECIPIENT_ACCOUNT_FIELDS);

type SoftDetails = VerifyFailDetails & {
  limitUi?: string;
  requestedUi?: string;
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

function enrichSpendDetails(fail: VerifyFail): SoftDetails {
  const details = fail.details ?? {};
  const scale = 10 ** USDC_DECIMALS;
  const mint = typeof details.mint === "string" ? details.mint : null;
  const amount = typeof details.amount === "string" ? details.amount : null;
  const limitRaw = details.limit != null ? String(details.limit) : null;
  const isUsdc = mint === String(getUsdcMint());

  return {
    ...details,
    limitUi:
      isUsdc && limitRaw != null
        ? (Number(limitRaw) / scale).toFixed(2)
        : undefined,
    requestedUi:
      isUsdc && amount != null
        ? (Number(amount) / scale).toFixed(2)
        : undefined,
  };
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
    mint != null &&
    mint !== String(getUsdcMint())
  ) {
    return softDeny(
      "approval_required",
      "Non-USDC token sends need a one-time approval.",
      details,
    );
  }

  if (fail.code === "instruction_denied") {
    return softDeny(
      "recipient_denied",
      "Transfers to this address are blocked.",
      details,
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
      details,
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
  return softDeny(fail.code, error, details);
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
  if (!result.ok) return mapVerifyFail(result);
  return { ok: true };
}
