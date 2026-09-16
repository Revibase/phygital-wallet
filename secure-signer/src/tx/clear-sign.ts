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

/**
 * Mint → decimals/symbol for clear-signing. Policy caps and some token transfers
 * only carry raw amounts; the signer never trusts parent-supplied decimals.
 */
const KNOWN_MINT_META: ReadonlyMap<string, { decimals: number; symbol: string }> =
  new Map([
    [
      "So11111111111111111111111111111111111111112",
      { decimals: 9, symbol: "SOL" },
    ],
    [
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      { decimals: 6, symbol: "USDC" },
    ],
    [
      "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDnm3",
      { decimals: 6, symbol: "USDC" },
    ],
    [
      "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      { decimals: 6, symbol: "USDT" },
    ],
  ]);

export function mintMeta(
  mint: string,
): { decimals: number; symbol: string } | null {
  return KNOWN_MINT_META.get(mint) ?? null;
}

/** UI amount + symbol when decimals are known; otherwise a clear fallback. */
export function formatTokenAmount(
  raw: bigint,
  mint: string,
  decimalsHint?: number | null,
): string {
  const known = mintMeta(mint);
  const decimals = known?.decimals ?? decimalsHint ?? null;
  const symbol = known?.symbol;
  if (decimals == null) {
    return symbol
      ? `${raw.toString()} ${symbol}`
      : `${raw.toString()} · mint ${shorten(mint)}`;
  }
  const amount = formatUnits(raw, decimals);
  return symbol ? `${amount} ${symbol}` : `${amount} · mint ${shorten(mint)}`;
}

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
      return "All instructions";
    case "Restricted":
      return `${access.fields[0].length} rule${access.fields[0].length === 1 ? "" : "s"}`;
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

/** Human rows for SetWalletPolicy payload — one fact per row (no packed · strings). */
export function describeWalletPolicy(data: {
  solCap: Option<SolCapArg>;
  mintCaps: Array<MintCapArg>;
  programPermissions: Array<ProgramPermission>;
}): DetailRow[] {
  const rows: DetailRow[] = [];
  const sol = optionSome(data.solCap);
  if (sol) {
    rows.push({
      label: "SOL limit",
      value: `${formatUnits(sol.cap, 9)} SOL`,
    });
    rows.push({
      label: "SOL window",
      value: windowPhrase(sol.windowSeconds),
    });
  } else {
    rows.push({
      label: "SOL limit",
      value: "None",
    });
  }

  if (data.mintCaps.length === 0) {
    rows.push({ label: "Token limits", value: "None" });
  } else {
    for (const [i, m] of data.mintCaps.entries()) {
      const mint = String(m.mint);
      const prefix =
        data.mintCaps.length === 1 ? "Token" : `Token ${i + 1}`;
      rows.push({
        label: `${prefix} limit`,
        value: formatTokenAmount(m.cap, mint),
      });
      rows.push({
        label: `${prefix} window`,
        value: windowPhrase(m.windowSeconds),
      });
    }
  }

  if (data.programPermissions.length === 0) {
    rows.push({
      label: "Programs",
      value: "Baseline only",
    });
  } else {
    for (const [i, p] of data.programPermissions.entries()) {
      rows.push({
        label:
          data.programPermissions.length === 1
            ? "Program"
            : `Program ${i + 1}`,
        value: shorten(p.programId),
      });
      rows.push({
        label:
          data.programPermissions.length === 1
            ? "Access"
            : `Access ${i + 1}`,
        value: accessLabel(p.access),
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
      const mint = accounts[1] ? String(accounts[1]) : "";
      if (amount !== null) {
        const amountLabel = mint
          ? formatTokenAmount(amount, mint, decimals)
          : formatUnits(amount, decimals);
        return {
          title: `Send ${amountLabel} (${kind})`,
          details: [
            { label: "Mint", value: mint ? shorten(mint) : "?" },
            { label: "From", value: accounts[0] ? shorten(accounts[0]) : "?" },
            { label: "To", value: accounts[2] ? shorten(accounts[2]) : "?" },
          ],
        };
      }
    }
    if (disc === 3 && data.length >= 9) {
      const amount = readU64LE(data, 1);
      if (amount !== null) {
        // Transfer (unchecked) has no mint/decimals in the ix — amount stays opaque.
        return {
          title: `Send tokens (${kind})`,
          details: [
            { label: "Amount", value: amount.toString() },
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
