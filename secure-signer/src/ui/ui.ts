/**
 * Trusted, signer-rendered UI (§23). Everything security-sensitive shown here is
 * derived from the signer's OWN decoder/policy — never from parent-supplied text.
 *
 * DOM is built with createElement + textContent only: no innerHTML, no inline
 * handlers, no template strings injected as HTML (§25). This keeps the strict CSP
 * (`script-src 'self'`, no 'unsafe-inline') honest.
 */

import type { TransactionSummary } from "../tx/policy.js";
import {
  classifySignRisk,
  EXPORT_CONFIRM_PHRASE,
  HIGH_RISK_CONFIRM_PHRASE,
  highRiskWarning,
  instructionLabel,
} from "../tx/sign-risk.js";
import { validateUserName } from "../user-name.js";

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

type ScreenOpts = {
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

function screen(
  title: string,
  body: Node[],
  actions: Node[],
  opts: ScreenOpts = {},
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

  sheet.appendChild(el("div", { class: "body" }, body));
  if (actions.length) sheet.appendChild(el("div", { class: "actions" }, actions));
  root.appendChild(sheet);

  const focusable = sheet.querySelector<HTMLElement>(
    "input, textarea, button:not(.close-btn)",
  );
  focusable?.focus();
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

export function renderIdle(): void {
  busyDismiss = null;
  detachEscape();
  clear(app());
}

export function renderBoot(): void {
  screen(" ", [el("p", { class: "muted", text: " " })], [], { grabber: true });
}

/**
 * Register a cancel handler for the current busy screen (passkey / restoring).
 * Cleared when the next screen replaces it or on idle.
 */
export function setBusyDismiss(handler: (() => void) | null): void {
  busyDismiss = handler;
}

export function renderBusy(message: string): void {
  screen(
    "Continue on your device",
    [
      el("div", { class: "spinner" }),
      el("p", { class: "muted", text: message }),
    ],
    [],
    {
      dismissible: true,
      onDismiss: () => {
        const fn = busyDismiss;
        busyDismiss = null;
        fn?.();
      },
    },
  );
}

export function renderError(message: string, onDismiss?: () => void): void {
  screen(
    "Something went wrong",
    [el("p", { class: "muted", text: message })],
    [],
    onDismiss
      ? { dismissible: true, onDismiss }
      : {},
  );
}

export function confirmChooser(hasLocalWallet: boolean): Promise<"signin" | "create" | "cancel"> {
  return new Promise((resolve) => {
    const done = (v: "signin" | "create" | "cancel") => {
      detachEscape();
      resolve(v);
    };
    screen(
      "Sign in",
      [
        el("p", {
          class: "subtitle",
          text: hasLocalWallet
            ? "A wallet on this device can be unlocked with your passkey."
            : "Use your passkey to unlock an existing wallet, or create a new one.",
        }),
      ],
      [
        button("Create account", "ghost", () => done("create")),
        button("Sign in", "primary", () => done("signin")),
      ],
      { dismissible: true, onDismiss: () => done("cancel") },
    );
  });
}

export function confirmCreate(
  existingWallet: boolean,
): Promise<{ userName: string } | null> {
  return new Promise((resolve) => {
    const done = (v: { userName: string } | null) => {
      detachEscape();
      resolve(v);
    };
    const input = el("input", { class: "input" });
    input.type = "text";
    input.autocomplete = "username";
    input.spellcheck = false;
    input.maxLength = 32;
    input.placeholder = "Choose a username";
    input.setAttribute("aria-label", "Username");
    const error = el("p", { class: "field-error" });
    error.hidden = true;

    const proceed = button("Create with passkey", "primary", () => {
      const result = validateUserName(input.value);
      if (!result.ok) {
        error.textContent = result.reason;
        error.hidden = false;
        input.focus();
        return;
      }
      done({ userName: result.userName });
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        proceed.click();
      }
    });

    const body: Node[] = [
      el("p", {
        text: "Pick a username for this passkey. You’ll see it in your password manager.",
      }),
      input,
      error,
      el("p", {
        class: "muted",
        text: "A signing key is created here and locked with your passkey. Keep a synced copy — without it, this wallet cannot be recovered.",
      }),
    ];
    if (existingWallet) {
      body.unshift(
        el("p", {
          class: "warn",
          text: "This device already has a wallet. Creating a new one does not delete the old key, but this app will switch to the new one.",
        }),
      );
    }
    screen(
      "Create account",
      body,
      [
        button("Cancel", "ghost", () => done(null)),
        proceed,
      ],
      { dismissible: true, onDismiss: () => done(null) },
    );
    input.focus();
  });
}

export function confirmImport(): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      detachEscape();
      resolve(v);
    };
    screen(
      "Sign in",
      [
        el("p", {
          text: "Authenticate with your passkey to unlock this wallet.",
        }),
      ],
      [
        button("Cancel", "ghost", () => done(false)),
        button("Continue with passkey", "primary", () => done(true)),
      ],
      { dismissible: true, onDismiss: () => done(false) },
    );
  });
}

export function confirmConflict(): Promise<"local" | "cancel"> {
  return new Promise((resolve) => {
    const done = (v: "local" | "cancel") => {
      detachEscape();
      resolve(v);
    };
    screen(
      "Different wallet on this device",
      [
        el("p", {
          text: "This device already has a wallet that does not match the backup from the app.",
        }),
        el("p", {
          class: "muted",
          text: "The backup was not applied. You can keep using the wallet stored on this device.",
        }),
      ],
      [
        button("Cancel", "ghost", () => done("cancel")),
        button("Use this device", "primary", () => done("local")),
      ],
      { dismissible: true, onDismiss: () => done("cancel") },
    );
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
    screen(
      created ? "Account created" : "Signed in",
      [
        el("p", { text: created ? "Your wallet is ready." : "Wallet unlocked." }),
        el("p", { class: "mono muted", text: shorten(publicKey) }),
      ],
      [],
      { dismissible: true, onDismiss: done },
    );
    const timer = window.setTimeout(done, 700);
  });
}

export function showRecoverable(message: string): Promise<"retry" | "cancel"> {
  return new Promise((resolve) => {
    const done = (v: "retry" | "cancel") => {
      detachEscape();
      resolve(v);
    };
    screen(
      "Couldn’t continue",
      [el("p", { class: "muted", text: message })],
      [
        button("Cancel", "ghost", () => done("cancel")),
        button("Try again", "primary", () => done("retry")),
      ],
      { dismissible: true, onDismiss: () => done("cancel") },
    );
  });
}

export function showRestored(publicKey: string): void {
  screen(
    "Signed in",
    [
      el("p", { text: "Wallet unlocked." }),
      el("p", { class: "mono muted", text: publicKey }),
    ],
    [],
  );
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

    const actions: Node[] = [button("Cancel", "ghost", () => done(false))];

    if (risk === "high") {
      const input = el("input", { class: "input" });
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.placeholder = `Type ${HIGH_RISK_CONFIRM_PHRASE}`;
      input.setAttribute(
        "aria-label",
        `Type ${HIGH_RISK_CONFIRM_PHRASE} to confirm`,
      );
      const proceed = button("Authorize with passkey", "danger", () => {
        if (input.value.trim() === HIGH_RISK_CONFIRM_PHRASE) done(true);
      });
      proceed.disabled = true;
      const sync = () => {
        proceed.disabled = input.value.trim() !== HIGH_RISK_CONFIRM_PHRASE;
      };
      input.addEventListener("input", sync);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!proceed.disabled) proceed.click();
        }
      });
      body.push(
        el("p", {
          class: "muted",
          text: `Type ${HIGH_RISK_CONFIRM_PHRASE} to confirm you understand the risk:`,
        }),
        input,
      );
      actions.push(proceed);
      screen("High-risk authorization", body, actions, {
        dismissible: true,
        onDismiss: () => done(false),
      });
      input.focus();
      return;
    }

    actions.push(
      button("Authorize with passkey", "primary", () => done(true)),
    );
    screen("Authorize", body, actions, {
      dismissible: true,
      onDismiss: () => done(false),
    });
  });
}

function row(label: string, value: string): HTMLElement {
  return el("div", { class: "kv-row" }, [
    el("span", { class: "kv-label", text: label }),
    el("span", { class: "kv-value mono", text: value }),
  ]);
}

export function confirmExportPrivateKey(): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      detachEscape();
      resolve(v);
    };
    const input = el("input", { class: "input" });
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = `Type ${EXPORT_CONFIRM_PHRASE}`;
    input.setAttribute(
      "aria-label",
      `Type ${EXPORT_CONFIRM_PHRASE} to confirm`,
    );
    const proceed = button("Continue to export", "danger", () => {
      if (input.value.trim() === EXPORT_CONFIRM_PHRASE) done(true);
    });
    proceed.disabled = true;
    const sync = () => {
      proceed.disabled = input.value.trim() !== EXPORT_CONFIRM_PHRASE;
    };
    input.addEventListener("input", sync);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!proceed.disabled) proceed.click();
      }
    });
    screen(
      "Export private key",
      [
        el("div", {
          class: "callout callout-danger",
          text: "This is the only way this signer reveals your private key. Signing transactions never shows it.",
        }),
        el("p", {
          text: "Anyone with this key can move your funds forever. Do not export on a shared device or if you did not open this screen yourself.",
        }),
        el("p", {
          class: "muted",
          text: `Type ${EXPORT_CONFIRM_PHRASE} to confirm:`,
        }),
        input,
      ],
      [button("Cancel", "ghost", () => done(false)), proceed],
      { dismissible: true, onDismiss: () => done(false) },
    );
    input.focus();
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
    const secret = el("textarea", { class: "secret mono" });
    secret.readOnly = true;
    secret.hidden = true;
    secret.value = secretBase58;
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
          secret.select();
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

    screen(
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
