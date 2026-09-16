/**
 * Trusted, signer-rendered UI (§23). Everything security-sensitive shown here is
 * derived from the signer's OWN decoder/policy — never from parent-supplied text.
 *
 * DOM is built with createElement + textContent only: no innerHTML, no inline
 * handlers, no template strings injected as HTML (§25). This keeps the strict CSP
 * (`script-src 'self'`, no 'unsafe-inline') honest.
 *
 * Two sheet families (same chrome, different body layouts):
 *   - statusScreen  — centered ceremony (busy / success / error)
 *   - confirmScreen — scrollable copy + sticky actions (authorize / export / …)
 */

import type { TransactionSummary } from "../tx/policy.js";
import { formatUnits } from "../tx/clear-sign.js";
import {
  classifySignRisk,
  instructionLabel,
  instructionSubtitle,
  riskCallout,
} from "../tx/sign-risk.js";

const app = (): HTMLElement => {
  const root = document.getElementById("app");
  if (!root) throw new Error("missing #app");
  return root;
};

function clear(node: HTMLElement) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { class?: string; text?: string } = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  for (const c of children) node.appendChild(c);
  return node;
}

function shorten(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
}

type DismissOpts = {
  dismissible?: boolean;
  onDismiss?: () => void;
  grabber?: boolean;
};

let escapeHandler: ((e: KeyboardEvent) => void) | null = null;
/** Cancel callback while a busy/passkey screen is showing. */
let busyDismiss: (() => void) | null = null;

function detachEscape() {
  if (escapeHandler) {
    window.removeEventListener("keydown", escapeHandler);
    escapeHandler = null;
  }
}

function closeButton(onClick: () => void): HTMLButtonElement {
  const b = el("button", { class: "close-btn", text: "×" });
  b.type = "button";
  b.setAttribute("aria-label", "Close");
  b.addEventListener("click", onClick);
  return b;
}

function button(
  label: string,
  variant: "primary" | "ghost" | "danger",
  onClick: () => void,
): HTMLButtonElement {
  const b = el("button", { class: `btn btn-${variant}`, text: label });
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

/** Shared sheet chrome: grabber, optional close, Escape → dismiss. */
function mountSheet(
  title: string,
  body: HTMLElement,
  actions: Node[],
  opts: DismissOpts = {},
): void {
  const root = app();
  clear(root);
  detachEscape();

  const sheet = el("div", { class: "sheet" });
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "ss-title");
  if (opts.grabber !== false) {
    sheet.appendChild(el("div", { class: "grabber" }));
  }

  const header = el("div", { class: "sheet-header" });
  const h1 = el("h1", { class: "title", text: title });
  h1.id = "ss-title";
  header.appendChild(h1);
  if (opts.dismissible && opts.onDismiss) {
    const dismiss = opts.onDismiss;
    header.appendChild(
      closeButton(() => {
        detachEscape();
        dismiss();
      }),
    );
    escapeHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        detachEscape();
        dismiss();
      }
    };
    window.addEventListener("keydown", escapeHandler);
  }
  sheet.appendChild(header);
  sheet.appendChild(body);
  if (actions.length) {
    sheet.appendChild(el("div", { class: "actions" }, actions));
  }
  root.appendChild(sheet);
}

export type StatusTone = "busy" | "success" | "error" | "neutral";

/**
 * Centered ceremony body — loading, success, and error share one layout so
 * passkey / restore / authorize waits feel like one surface.
 */
function statusScreen(args: {
  title: string;
  body?: string;
  tone?: StatusTone;
  detail?: Node[];
  actions?: Node[];
  dismissible?: boolean;
  onDismiss?: () => void;
}): void {
  const tone = args.tone ?? "neutral";
  const mark =
    tone === "busy"
      ? el("div", { class: "status-mark status-mark-busy" }, [
          el("div", { class: "spinner" }),
        ])
      : tone === "success"
        ? el("div", {
            class: "status-mark status-mark-success",
            text: "✓",
          })
        : tone === "error"
          ? el("div", {
              class: "status-mark status-mark-error",
              text: "!",
            })
          : null;

  const status = el("div", { class: "status" });
  if (mark) status.appendChild(mark);
  const titleEl = el("p", { class: "status-title", text: args.title });
  titleEl.id = "ss-title";
  status.appendChild(titleEl);
  if (args.body) {
    status.appendChild(el("p", { class: "status-body", text: args.body }));
  }
  if (args.detail) {
    for (const node of args.detail) status.appendChild(node);
  }

  mountSheet(
    "", // real title lives in the ceremony body
    el("div", { class: "body body-status" }, [status]),
    args.actions ?? [],
    {
      grabber: true,
      ...(args.dismissible && args.onDismiss
        ? { dismissible: true, onDismiss: args.onDismiss }
        : {}),
    },
  );

  const sheet = app().querySelector(".sheet");
  sheet?.classList.add("sheet-status");
  const headerTitle = app().querySelector(".sheet-header .title");
  if (headerTitle) {
    headerTitle.removeAttribute("id");
    headerTitle.setAttribute("aria-hidden", "true");
  }
}

/** Interactive sheet: left-aligned copy + sticky action row. */
function confirmScreen(
  title: string,
  bodyNodes: Node[],
  actions: Node[],
  opts: DismissOpts = {},
): void {
  mountSheet(title, el("div", { class: "body" }, bodyNodes), actions, opts);
}

function promptChoice<T>(args: {
  title: string;
  body: Node[];
  primary: { label: string; value: T; variant?: "primary" | "danger" };
  secondary?: { label: string; value: T };
  cancelValue: T;
}): Promise<T> {
  return new Promise((resolve) => {
    const done = (v: T) => {
      detachEscape();
      resolve(v);
    };
    const actions: Node[] = [];
    if (args.secondary) {
      actions.push(
        button(args.secondary.label, "ghost", () => done(args.secondary!.value)),
      );
    }
    actions.push(
      button(args.primary.label, args.primary.variant ?? "primary", () =>
        done(args.primary.value),
      ),
    );
    confirmScreen(args.title, args.body, actions, {
      dismissible: true,
      onDismiss: () => done(args.cancelValue),
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderIdle(): void {
  busyDismiss = null;
  detachEscape();
  clear(app());
}

export function renderBoot(): void {
  statusScreen({
    title: "Secure signer",
    body: "Preparing…",
    tone: "busy",
  });
}

/**
 * Register a cancel handler for the current busy screen (passkey / restoring).
 * Cleared when the next screen replaces it or on idle.
 */
export function setBusyDismiss(handler: (() => void) | null): void {
  busyDismiss = handler;
}

export function renderBusy(message: string): void {
  statusScreen({
    title: "Waiting for passkey",
    body: message,
    tone: "busy",
    dismissible: true,
    onDismiss: () => {
      const fn = busyDismiss;
      busyDismiss = null;
      fn?.();
    },
  });
}

export function renderError(message: string, onDismiss?: () => void): void {
  statusScreen({
    title: "Couldn’t continue",
    body: message,
    tone: "error",
    ...(onDismiss
      ? { dismissible: true, onDismiss }
      : {}),
  });
}

export function confirmImport(): Promise<boolean> {
  return promptChoice({
    title: "Unlock with passkey",
    body: [
      el("p", {
        text: "Use your passkey to unlock this wallet on this phone.",
      }),
    ],
    primary: { label: "Unlock with passkey", value: true },
    secondary: { label: "Cancel", value: false },
    cancelValue: false,
  });
}

/** After the app created a passkey — iframe needs a tap for WebAuthn get+PRF. */
export function confirmFinishCreate(): Promise<boolean> {
  return promptChoice({
    title: "Confirm on this phone",
    body: [
      el("p", {
        text: "Confirm with the passkey you just created to lock your wallet key on this phone.",
      }),
      el("p", {
        class: "muted",
        text: "Step 2 of 2 · Your signing key never leaves this secure window.",
      }),
    ],
    primary: { label: "Confirm with passkey", value: true },
    secondary: { label: "Cancel", value: false },
    cancelValue: false,
  });
}

export function showSuccess(publicKey: string, created: boolean): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      detachEscape();
      resolve();
    };
    statusScreen({
      title: created ? "Passkey ready" : "Wallet unlocked",
      body: created
        ? "Your wallet is set up on this phone."
        : "You’re back in — returning to the app.",
      tone: "success",
      detail: [el("p", { class: "mono muted status-detail", text: shorten(publicKey) })],
      dismissible: true,
      onDismiss: done,
    });
    const timer = window.setTimeout(done, 700);
  });
}

export function showRecoverable(message: string): Promise<"retry" | "cancel"> {
  return new Promise((resolve) => {
    const done = (v: "retry" | "cancel") => {
      detachEscape();
      resolve(v);
    };
    statusScreen({
      title: "Couldn’t continue",
      body: message,
      tone: "error",
      actions: [
        button("Cancel", "ghost", () => done("cancel")),
        button("Try again", "primary", () => done("retry")),
      ],
      dismissible: true,
      onDismiss: () => done("cancel"),
    });
  });
}

export function showRestored(publicKey: string): void {
  statusScreen({
    title: "Signed in",
    body: "Wallet unlocked.",
    tone: "success",
    detail: [el("p", { class: "mono muted status-detail", text: publicKey })],
  });
}

// ---------------------------------------------------------------------------
// Transaction confirmation
// ---------------------------------------------------------------------------

type Hero = { title: string; subtitle: string | null };

function pickToSubtitle(
  details: ReadonlyArray<{ label: string; value: string }>,
): string | null {
  const to = details.find((d) => d.label === "To");
  return to ? `To ${to.value}` : null;
}

function confirmHero(summary: TransactionSummary): Hero {
  const spends = summary.instructions.flatMap((ix) => ix.inner ?? []);
  const send = spends.find((s) => /^Send\b/i.test(s.title));
  if (send) {
    return {
      title: send.title.replace(/\s*\((Token(?:-2022)?)\)\s*$/i, "").trim(),
      subtitle: pickToSubtitle(send.details),
    };
  }
  if (spends.length === 1) {
    return {
      title: spends[0]!.title,
      subtitle: pickToSubtitle(spends[0]!.details),
    };
  }
  if (spends.length > 1) {
    return {
      title: `${spends.length} actions`,
      subtitle: spends.map((s) => s.title).join(" · "),
    };
  }

  const first = summary.instructions[0];
  if (!first) return { title: "Authorize", subtitle: null };
  return {
    title: instructionLabel(first.kind),
    subtitle: instructionSubtitle(first.kind),
  };
}

function primaryRows(
  summary: TransactionSummary,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const spends = summary.instructions.flatMap((ix) => ix.inner ?? []);

  if (spends.length === 1) {
    for (const d of spends[0]!.details) {
      if (d.label === "To" || d.label === "From" || d.label === "Text") {
        rows.push(d);
      }
    }
    return rows;
  }

  if (spends.length > 1) {
    for (const [i, s] of spends.entries()) {
      rows.push({
        label: spends.length <= 3 ? s.title : `Action ${i + 1}`,
        value: pickToSubtitle(s.details)?.replace(/^To /, "") ?? "—",
      });
    }
    return rows;
  }

  // Policy / authority ops: show the first few decoded detail rows.
  for (const ix of summary.instructions) {
    for (const d of ix.details.slice(0, 4)) {
      rows.push(d);
    }
  }
  return rows;
}

function advancedRows(
  summary: TransactionSummary,
  primary: Array<{ label: string; value: string }>,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Wallet", value: shorten(summary.walletAddress) },
  ];
  const primaryKeys = new Set(primary.map((r) => `${r.label}|${r.value}`));

  for (const [i, ix] of summary.instructions.entries()) {
    if (summary.instructions.length > 1) {
      rows.push({
        label: `Step ${i + 1}`,
        value: instructionLabel(ix.kind),
      });
    }
    if (ix.phygitalToken) {
      rows.push({ label: "Accessory", value: shorten(ix.phygitalToken) });
    }
    for (const d of ix.details) {
      if (!primaryKeys.has(`${d.label}|${d.value}`)) rows.push(d);
    }
    if (ix.inner) {
      for (const inner of ix.inner) {
        for (const d of inner.details) {
          if (d.label === "Mint" || d.label === "Owner") rows.push(d);
        }
      }
    }
  }

  if (summary.config.priorityFeeLamports !== undefined) {
    rows.push({
      label: "Priority fee",
      value: `${formatUnits(BigInt(summary.config.priorityFeeLamports), 9)} SOL`,
    });
  }
  if (summary.config.computeUnitLimit !== undefined) {
    rows.push({
      label: "Compute units",
      value: String(summary.config.computeUnitLimit),
    });
  }

  return rows;
}

function group(
  className: string,
  rows: Array<{ label: string; value: string }>,
): HTMLElement | null {
  if (rows.length === 0) return null;
  return el(
    "div",
    { class: className },
    rows.map((r) => detailRow(r.label, r.value)),
  );
}

function detailRow(label: string, value: string): HTMLElement {
  const long =
    value.length > 28 ||
    value.includes(" · ") ||
    value.includes("\n") ||
    /None \(|Baseline|Restricted|Allowed/.test(value);
  return el("div", { class: long ? "kv-row kv-row-stack" : "kv-row" }, [
    el("span", { class: "kv-label", text: label }),
    el("span", { class: "kv-value mono", text: value }),
  ]);
}

function heroBlock(hero: Hero): HTMLElement {
  const wrap = el("div", { class: "tx-hero" });
  wrap.appendChild(el("p", { class: "tx-hero-title", text: hero.title }));
  if (hero.subtitle) {
    wrap.appendChild(
      el("p", { class: "tx-hero-subtitle", text: hero.subtitle }),
    );
  }
  return wrap;
}

export function confirmSignTransaction(
  summary: TransactionSummary,
): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      detachEscape();
      resolve(v);
    };
    const risk = classifySignRisk(summary);
    const hero = confirmHero(summary);
    const callout = riskCallout(summary.instructions);
    const primary = primaryRows(summary);
    const advanced = advancedRows(summary, primary);

    const body: Node[] = [heroBlock(hero)];

    if (callout) {
      body.push(
        el("div", {
          class:
            risk === "critical"
              ? "callout callout-danger"
              : "callout callout-warn",
          text: callout,
        }),
      );
    }

    const primaryGroup = group("kv kv-primary", primary);
    if (primaryGroup) body.push(primaryGroup);

    const advancedGroup = group("kv", advanced);
    if (advancedGroup) {
      const details = el("details", { class: "tx-details" });
      details.appendChild(
        el("summary", { class: "tx-details-summary", text: "Details" }),
      );
      details.appendChild(advancedGroup);
      body.push(details);
    }

    const ctaVariant = risk === "critical" ? "danger" : "primary";
    const ctaLabel =
      risk === "critical" ? "Continue with passkey" : "Authorize with passkey";

    confirmScreen(
      "Authorize",
      body,
      [
        button("Cancel", "ghost", () => done(false)),
        button(ctaLabel, ctaVariant, () => done(true)),
      ],
      { dismissible: true, onDismiss: () => done(false) },
    );
  });
}

export function confirmExportPrivateKey(): Promise<boolean> {
  return promptChoice({
    title: "Export private key",
    body: [
      el("div", {
        class: "callout callout-danger",
        text: "Anyone with this key can move your funds forever.",
      }),
      el("p", {
        class: "muted",
        text: "Only export on a device you trust. Prefer a password manager or offline backup.",
      }),
    ],
    primary: {
      label: "Continue to export",
      value: true,
      variant: "danger",
    },
    secondary: { label: "Cancel", value: false },
    cancelValue: false,
  });
}

/** Reveal the exported secret ONLY inside the signer UI — never posted to parent. */
export function showExportedSecret(
  secretBase58: string,
  publicKey: string,
): Promise<void> {
  return new Promise((resolve) => {
    let clipboardTimer: number | null = null;
    const done = () => {
      if (clipboardTimer !== null) window.clearTimeout(clipboardTimer);
      detachEscape();
      resolve();
    };

    const hidden = el("p", {
      class: "secret-hidden mono",
      text: "••••••••••••••••••••••••••••••••",
    });
    const secret = el("p", {
      class: "secret mono",
      text: secretBase58,
    });
    secret.hidden = true;
    secret.setAttribute("aria-label", "exported secret key");

    const copyBtn = button("Copy to clipboard", "primary", () => {
      void navigator.clipboard
        ?.writeText(secretBase58)
        .then(() => {
          copyBtn.textContent = "Copied — clear clipboard in 30s";
          copyBtn.disabled = true;
          if (clipboardTimer !== null) window.clearTimeout(clipboardTimer);
          clipboardTimer = window.setTimeout(() => {
            void navigator.clipboard?.writeText("").catch(() => {});
            copyBtn.textContent = "Clipboard cleared";
          }, 30_000);
        })
        .catch(() => {
          copyBtn.textContent = "Copy failed — select the key above";
        });
    });
    copyBtn.disabled = true;

    const revealBtn = button("Show private key", "danger", () => {
      hidden.hidden = true;
      secret.hidden = false;
      copyBtn.disabled = false;
      revealBtn.disabled = true;
      revealBtn.textContent = "Key visible on screen";
    });

    confirmScreen(
      "Your private key",
      [
        el("div", {
          class: "callout callout-danger",
          text: "Keep this only in a password manager or offline backup.",
        }),
        el("p", { class: "muted", text: `Wallet ${shorten(publicKey)}` }),
        hidden,
        secret,
      ],
      [button("Done", "ghost", () => done()), revealBtn, copyBtn],
      { dismissible: true, onDismiss: done },
    );
  });
}
