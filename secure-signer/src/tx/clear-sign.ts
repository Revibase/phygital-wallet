/**
 * Trusted clear-signing helpers for confirmation UI.
 * Decodes only instruction layouts the app actually builds (send/top-up/policy).
 */

import type { Option } from "@solana/kit";

export interface DetailRow {
  label: string;
  value: string;
}

export interface ClearedInner {
  title: string;
  details: DetailRow[];
}

type SolCapArg = { cap: bigint; windowSeconds: bigint };
type MintCapArg = { mint: string; cap: bigint; windowSeconds: bigint };
type ProgramAccess =
  | { __kind: "Denied" }
  | { __kind: "AllInstructions" }
  | { __kind: "Restricted"; fields: readonly [readonly unknown[]] };
type ProgramPermission = { programId: string; access: ProgramAccess };

const SYSTEM = "11111111111111111111111111111111";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ATA = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const MEMO = "MemoSq4gqBnyyd8CMoPbUxRWDFBIdzy9SHRdJrEqeL";
const MEMO_V1 = "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo";
const METADATA = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const BUBBLEGUM = "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY";
const CORE = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";

function readU32LE(data: Uint8Array, o: number): number | null {
  if (o + 4 > data.length) return null;
  return (
    (data[o]! |
      (data[o + 1]! << 8) |
      (data[o + 2]! << 16) |
      (data[o + 3]! << 24)) >>>
    0
  );
}

function readU64LE(data: Uint8Array, o: number): bigint | null {
  if (o + 8 > data.length) return null;
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(data[o + i]!) << BigInt(8 * i);
  return v;
}

function shorten(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

/** Format raw units with known decimals; trim trailing zeros. */
export function formatUnits(raw: bigint, decimals: number): string {
  if (decimals <= 0) return raw.toString();
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0");
  frac = frac.replace(/0+$/, "");
  const s = frac ? `${whole}.${frac}` : whole.toString();
  return neg ? `-${s}` : s;
}

export function windowPhrase(windowSeconds: bigint): string {
  if (windowSeconds === 0n) return "lifetime";
  if (windowSeconds === 86_400n) return "every day";
  if (windowSeconds === 604_800n) return "every week";
  if (windowSeconds === 2_592_000n) return "every month";
  if (windowSeconds % 86_400n === 0n) {
    const days = windowSeconds / 86_400n;
    return `every ${days} day${days === 1n ? "" : "s"}`;
  }
  return `every ${windowSeconds}s`;
}

function accessLabel(access: ProgramAccess): string {
  switch (access.__kind) {
    case "Denied":
      return "Denied";
    case "AllInstructions":
      return "Allowed (all instructions)";
    case "Restricted":
      return `Restricted (${access.fields[0].length} instruction rule${access.fields[0].length === 1 ? "" : "s"})`;
    default:
      return "Unknown";
  }
}

function optionSome<T>(opt: Option<T>): T | null {
  if (opt && typeof opt === "object" && "__option" in opt) {
    return opt.__option === "Some" ? (opt.value as T) : null;
  }
  return null;
}

/** Human rows for SetWalletPolicy payload. */
export function describeWalletPolicy(data: {
  solCap: Option<SolCapArg>;
  mintCaps: Array<MintCapArg>;
  programPermissions: Array<ProgramPermission>;
}): DetailRow[] {
  const rows: DetailRow[] = [];
  const sol = optionSome(data.solCap);
  if (sol) {
    rows.push({
      label: "SOL spend cap",
      value: `${formatUnits(sol.cap, 9)} SOL · ${windowPhrase(sol.windowSeconds)}`,
    });
  } else {
    rows.push({
      label: "SOL spend cap",
      value: "None (SOL blocked if any other cap exists)",
    });
  }

  if (data.mintCaps.length === 0) {
    rows.push({ label: "Token spend caps", value: "None" });
  } else {
    for (const [i, m] of data.mintCaps.entries()) {
      rows.push({
        label:
          data.mintCaps.length === 1 ? "Token spend cap" : `Token cap ${i + 1}`,
        value: `${m.cap.toString()} raw · mint ${shorten(m.mint)} · ${windowPhrase(m.windowSeconds)}`,
      });
    }
  }

  if (data.programPermissions.length === 0) {
    rows.push({
      label: "Program rules",
      value: "Baseline only (no overrides)",
    });
  } else {
    for (const [i, p] of data.programPermissions.entries()) {
      rows.push({
        label:
          data.programPermissions.length === 1
            ? "Program rule"
            : `Program rule ${i + 1}`,
        value: `${shorten(p.programId)} · ${accessLabel(p.access)}`,
      });
    }
  }
  return rows;
}

/** Decode one compact CPI the app may place inside executeWithAuthority. */
export function describeInnerInstruction(
  programAddress: string,
  accounts: readonly string[],
  data: Uint8Array,
): ClearedInner {
  if (programAddress === SYSTEM) {
    const disc = readU32LE(data, 0);
    if (disc === 2) {
      const lamports = readU64LE(data, 4);
      if (lamports !== null) {
        const from = accounts[0] ? shorten(accounts[0]) : "?";
        const to = accounts[1] ? shorten(accounts[1]) : "?";
        return {
          title: `Send ${formatUnits(lamports, 9)} SOL`,
          details: [
            { label: "From", value: from },
            { label: "To", value: to },
          ],
        };
      }
    }
    return {
      title: "System program",
      details: [
        { label: "Accounts", value: String(accounts.length) },
        { label: "Data bytes", value: String(data.length) },
      ],
    };
  }

  if (programAddress === MEMO || programAddress === MEMO_V1) {
    let text = "";
    try {
      text = new TextDecoder().decode(data);
    } catch {
      text = `(${data.length} bytes)`;
    }
    if (text.length > 80) text = `${text.slice(0, 77)}…`;
    return {
      title: "Memo",
      details: [{ label: "Text", value: text || "(empty)" }],
    };
  }

  if (programAddress === TOKEN || programAddress === TOKEN_2022) {
    const kind = programAddress === TOKEN_2022 ? "Token-2022" : "Token";
    const disc = data[0];
    if (disc === 12 && data.length >= 10) {
      const amount = readU64LE(data, 1);
      const decimals = data[9]!;
      if (amount !== null) {
        return {
          title: `Send ${formatUnits(amount, decimals)} tokens (${kind})`,
          details: [
            { label: "Mint", value: accounts[1] ? shorten(accounts[1]) : "?" },
            { label: "From", value: accounts[0] ? shorten(accounts[0]) : "?" },
            { label: "To", value: accounts[2] ? shorten(accounts[2]) : "?" },
          ],
        };
      }
    }
    if (disc === 3 && data.length >= 9) {
      const amount = readU64LE(data, 1);
      if (amount !== null) {
        return {
          title: `Send ${amount.toString()} raw tokens (${kind})`,
          details: [
            { label: "From", value: accounts[0] ? shorten(accounts[0]) : "?" },
            { label: "To", value: accounts[1] ? shorten(accounts[1]) : "?" },
          ],
        };
      }
    }
    return {
      title: `${kind} instruction`,
      details: [
        { label: "Accounts", value: String(accounts.length) },
        { label: "Data bytes", value: String(data.length) },
      ],
    };
  }

  if (programAddress === ATA) {
    const owner = accounts[2] ? shorten(accounts[2]) : "?";
    const mint = accounts[3] ? shorten(accounts[3]) : "?";
    return {
      title: data[0] === 1 ? "Create token account" : "Associated token",
      details: [
        { label: "Owner", value: owner },
        { label: "Mint", value: mint },
      ],
    };
  }

  if (programAddress === METADATA) {
    return {
      title: "Transfer pNFT (Token Metadata)",
      details: accounts.slice(0, 4).map((a, i) => ({
        label: `Account ${i + 1}`,
        value: shorten(a),
      })),
    };
  }
  if (programAddress === BUBBLEGUM) {
    return {
      title: "Transfer cNFT (Bubblegum)",
      details: [
        { label: "Accounts", value: String(accounts.length) },
        { label: "Data bytes", value: String(data.length) },
      ],
    };
  }
  if (programAddress === CORE) {
    return {
      title: "Transfer NFT (Core)",
      details: accounts.slice(0, 3).map((a, i) => ({
        label: `Account ${i + 1}`,
        value: shorten(a),
      })),
    };
  }

  return {
    title: `Call ${shorten(programAddress)}`,
    details: [
      { label: "Accounts", value: String(accounts.length) },
      { label: "Data bytes", value: String(data.length) },
    ],
  };
}
