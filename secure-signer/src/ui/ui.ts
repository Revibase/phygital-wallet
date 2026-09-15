/**
 * Trusted, signer-rendered UI (§23). Everything security-sensitive shown here is
 * derived from the signer's OWN decoder/policy — never from parent-supplied text.
 *
 * DOM is built with createElement + textContent only: no innerHTML, no inline
 * handlers, no template strings injected as HTML (§25). This keeps the strict CSP
 * (`script-src 'self'`, no 'unsafe-inline') honest.
 */

import type { TransactionSummary } from "../tx/policy.js";

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

function screen(title: string, body: Node[], actions: Node[]): void {
  const root = app();
  clear(root);
  const card = el("div", { class: "card" }, [
    el("h1", { class: "title", text: title }),
    el("div", { class: "body" }, body),
    el("div", { class: "actions" }, actions),
  ]);
  root.appendChild(card);
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
  screen(
    "Secure Signer",
    [
      el("p", {
        class: "muted",
        text: "This is an isolated signing surface. Actions require your passkey.",
      }),
    ],
    [],
  );
}

export function renderBusy(message: string): void {
  screen("Working…", [el("p", { class: "muted", text: message })], []);
}

export function renderError(message: string): void {
  screen(
    "Something went wrong",
    [el("p", { class: "muted", text: message })],
    [],
  );
}

/** Confirm wallet creation. Resolves true when the user proceeds. */
export function confirmCreate(): Promise<boolean> {
  return new Promise((resolve) => {
    screen(
      "Create a new wallet",
      [
        el("p", {
          text: "A new signing key will be generated inside this signer and protected by your passkey.",
        }),
        el("p", {
          class: "muted",
          text: "Keep the passkey — losing it (with no synced copy) means the wallet cannot be recovered.",
        }),
      ],
      [
        button("Cancel", "ghost", () => resolve(false)),
        button("Create with passkey", "primary", () => resolve(true)),
      ],
    );
  });
}

/** Confirm restore intent. Resolves true when the user proceeds. */
export function confirmImport(): Promise<boolean> {
  return new Promise((resolve) => {
    screen(
      "Restore wallet",
      [
        el("p", {
          text: "Authenticate with your passkey to unlock this encrypted wallet.",
        }),
      ],
      [
        button("Cancel", "ghost", () => resolve(false)),
        button("Continue with passkey", "primary", () => resolve(true)),
      ],
    );
  });
}

/** Show the restored public key derived from the AUTHENTICATED blob (§34). */
export function showRestored(publicKey: string): void {
  screen(
    "Wallet restored",
    [
      el("p", { text: "You unlocked the wallet:" }),
      el("p", { class: "mono", text: publicKey }),
    ],
    [],
  );
}

/** Trusted transaction confirmation. Resolves true on Authorize. */
export function confirmSignTransaction(
  summary: TransactionSummary,
): Promise<boolean> {
  return new Promise((resolve) => {
    const rows: Node[] = [];
    rows.push(row("Wallet", shorten(summary.walletAddress)));
    for (const [i, ix] of summary.instructions.entries()) {
      rows.push(
        el("div", { class: "sep", text: `Instruction ${i + 1}: ${ix.kind}` }),
      );
      if (ix.phygitalToken)
        rows.push(row("Accessory", shorten(ix.phygitalToken)));
      if (ix.inner) {
        for (const inner of ix.inner) {
          rows.push(row("Calls program", shorten(inner.programAddress)));
          rows.push(row("Accounts", String(inner.accounts.length)));
          rows.push(row("Data bytes", String(inner.dataLength)));
        }
      }
    }

    if (summary.config.priorityFeeLamports !== undefined)
      rows.push(
        row("Priority fee", `${summary.config.priorityFeeLamports} lamports`),
      );
    if (summary.config.computeUnitLimit !== undefined)
      rows.push(row("Compute units", String(summary.config.computeUnitLimit)));

    screen(
      "Authorize transaction",
      [
        el("div", { class: "kv" }, rows),
        el("p", {
          class: "muted",
          text: "Details above are decoded by the signer. Always read what you are approving.",
        }),
      ],
      [
        button("Cancel", "ghost", () => resolve(false)),
        button("Authorize with passkey", "primary", () => resolve(true)),
      ],
    );
  });
}

function row(label: string, value: string): HTMLElement {
  return el("div", { class: "kv-row" }, [
    el("span", { class: "kv-label", text: label }),
    el("span", { class: "kv-value mono", text: value }),
  ]);
}

/**
 * High-risk private-key export ceremony (§14). Requires an explicit typed
 * confirmation before proceeding to a fresh WebAuthn ceremony. Resolves true
 * only when the user typed the confirmation phrase and clicked continue.
 */
export function confirmExportPrivateKey(): Promise<boolean> {
  return new Promise((resolve) => {
    const input = el("input", { class: "input" });
    input.type = "text";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-label", "Type EXPORT to confirm");
    const proceed = button("Continue to export", "danger", () => {
      if (input.value.trim() === "EXPORT") resolve(true);
    });
    screen(
      "Export private key",
      [
        el("p", {
          class: "warn",
          text: "This reveals complete control of your wallet.",
        }),
        el("p", {
          text: "Anyone with this key can move your funds. Only continue if you understand the risk.",
        }),
        el("p", { class: "muted", text: "Type EXPORT to confirm:" }),
        input,
      ],
      [button("Cancel", "ghost", () => resolve(false)), proceed],
    );
  });
}

/** Reveal the exported secret ONLY inside the signer UI — never posted to parent. */
export function showExportedSecret(
  secretBase58: string,
  publicKey: string,
): void {
  const secret = el("textarea", { class: "secret mono" });
  secret.readOnly = true;
  secret.value = secretBase58;
  secret.setAttribute("aria-label", "exported secret key");
  screen(
    "Your private key",
    [
      el("p", {
        class: "warn",
        text: "Copy this now and store it securely. It will not be shown again.",
      }),
      el("p", { class: "muted", text: `Wallet ${shorten(publicKey)}` }),
      secret,
    ],
    [
      button("Copy", "primary", () => {
        secret.select();
        void navigator.clipboard?.writeText(secretBase58).catch(() => {});
      }),
      button("Done", "ghost", () => renderIdle()),
    ],
  );
}
