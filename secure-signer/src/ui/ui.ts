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
import {
  classifySignRisk,
  highRiskWarning,
  instructionLabel,
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
    title: "Continue on your device",
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
    title: "Something went wrong",
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
    primary: { label: "Continue with passkey", value: true },
    secondary: { label: "Cancel", value: false },
    cancelValue: false,
  });
}

/** After the app created a passkey — iframe needs a tap for WebAuthn get+PRF. */
export function confirmFinishCreate(): Promise<boolean> {
  return promptChoice({
    title: "Finish setup",
    body: [
      el("p", {
        text: "Confirm with the passkey you just created to lock your wallet key on this phone.",
      }),
      el("p", {
        class: "muted",
        text: "Your signing key never leaves this secure window.",
      }),
    ],
    primary: { label: "Continue with passkey", value: true },
    secondary: { label: "Cancel", value: false },
    cancelValue: false,
  });
}

export function confirmConflict(): Promise<"local" | "cancel"> {
  return promptChoice({
    title: "Different wallet on this device",
    body: [
      el("p", {
        text: "This device already has a wallet that does not match the backup from the app.",
      }),
      el("p", {
        class: "muted",
        text: "The backup was not applied. You can keep using the wallet stored on this device.",
      }),
    ],
    primary: { label: "Use this device", value: "local" as const },
    secondary: { label: "Cancel", value: "cancel" as const },
    cancelValue: "cancel",
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

export function confirmSignTransaction(
  summary: TransactionSummary,
): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      detachEscape();
      resolve(v);
    };
    const risk = classifySignRisk(summary);
    const rows: Node[] = [];
    rows.push(row("Wallet", shorten(summary.walletAddress)));
    for (const [i, ix] of summary.instructions.entries()) {
      rows.push(
        el("div", {
          class: "sep",
          text: `Instruction ${i + 1}: ${instructionLabel(ix.kind)}`,
        }),
      );
      if (ix.phygitalToken)
        rows.push(row("Accessory", shorten(ix.phygitalToken)));
      for (const d of ix.details) {
        rows.push(row(d.label, d.value));
      }
      if (ix.inner) {
        for (const [j, inner] of ix.inner.entries()) {
          rows.push(
            el("div", {
              class: "sep sep-inner",
              text: `Spend ${j + 1}: ${inner.title}`,
            }),
          );
          for (const d of inner.details) {
            rows.push(row(d.label, d.value));
          }
        }
      }
    }

    if (summary.config.priorityFeeLamports !== undefined)
      rows.push(
        row("Priority fee", `${summary.config.priorityFeeLamports} lamports`),
      );
    if (summary.config.computeUnitLimit !== undefined)
      rows.push(row("Compute units", String(summary.config.computeUnitLimit)));

    const body: Node[] = [];
    if (risk === "high") {
      body.push(
        el("div", {
          class: "callout callout-danger",
          text: highRiskWarning(summary.instructions),
        }),
        el("p", {
          class: "muted",
          text: "Signing never shows your private key — but approving the wrong spend can move funds. Only continue if you started this yourself.",
        }),
      );
    } else {
      body.push(
        el("p", {
          class: "muted",
          text: "Decoded by this signer. Read every line before you approve.",
        }),
      );
    }
    body.push(el("div", { class: "kv" }, rows));

    confirmScreen(
      risk === "high" ? "High-risk authorization" : "Authorize",
      body,
      [
        button("Cancel", "ghost", () => done(false)),
        button(
          "Authorize with passkey",
          risk === "high" ? "danger" : "primary",
          () => done(true),
        ),
      ],
      { dismissible: true, onDismiss: () => done(false) },
    );
  });
}

function row(label: string, value: string): HTMLElement {
  return el("div", { class: "kv-row" }, [
    el("span", { class: "kv-label", text: label }),
    el("span", { class: "kv-value mono", text: value }),
  ]);
}

export function confirmExportPrivateKey(): Promise<boolean> {
  return promptChoice({
    title: "Export private key",
    body: [
      el("div", {
        class: "callout callout-danger",
        text: "This is the only way this signer reveals your private key. Signing transactions never shows it.",
      }),
      el("p", {
        text: "Anyone with this key can move your funds forever. Do not export on a shared device or if you did not open this screen yourself.",
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
          text: "Keep this key only in a password manager or offline backup. Prefer writing it down over copying if this browser tab might be compromised.",
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
