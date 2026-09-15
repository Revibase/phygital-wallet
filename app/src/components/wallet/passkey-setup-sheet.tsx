"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copy, errorCopy } from "@/lib/copy/phygital";
import { registerOwnerPasskey } from "@/lib/wallet/register-owner-passkey";
import { toUserErrorMessage } from "@/lib/user-errors";

const USER_NAME_MIN = 3;
const USER_NAME_MAX = 32;
const USER_NAME_RE = /^[a-zA-Z0-9._-]+$/;

function validateUserName(raw: string): { ok: true; userName: string } | { ok: false; reason: string } {
  const userName = raw.trim();
  if (userName.length < USER_NAME_MIN) {
    return { ok: false, reason: copy.wallet.usernameInvalid };
  }
  if (userName.length > USER_NAME_MAX) {
    return { ok: false, reason: copy.wallet.usernameInvalid };
  }
  if (!USER_NAME_RE.test(userName)) {
    return { ok: false, reason: copy.wallet.usernameInvalid };
  }
  return { ok: true, userName };
}

export type PasskeySetupChoice =
  | { mode: "create"; userName: string; credentialId: string }
  | { mode: "unlock" }
  | { mode: "cancel" };

type Phase =
  | { kind: "chooser"; resolve: (v: PasskeySetupChoice) => void }
  | {
      kind: "username";
      resolve: (v: PasskeySetupChoice) => void;
    }
  | null;

type PasskeySetupApi = {
  /** First-time Continue: create vs unlock (app UI, not iframe). */
  promptSetup: () => Promise<PasskeySetupChoice>;
};

const PasskeySetupContext = createContext<PasskeySetupApi | null>(null);

export function PasskeySetupProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(null);
  const [userName, setUserName] = useState("");
  const [userError, setUserError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const close = useCallback((choice: PasskeySetupChoice) => {
    setPhase((p) => {
      if (p) {
        // After the sheet unmounts/paints — then the signer iframe.
        window.setTimeout(() => p.resolve(choice), 0);
      }
      return null;
    });
    setUserName("");
    setUserError(null);
    setCreating(false);
  }, []);

  const promptSetup = useCallback((): Promise<PasskeySetupChoice> => {
    return new Promise((resolve) => {
      setUserName("");
      setUserError(null);
      setCreating(false);
      setPhase({ kind: "chooser", resolve });
    });
  }, []);

  const createWithPasskey = useCallback(async () => {
    const v = validateUserName(userName);
    if (!v.ok) {
      setUserError(v.reason);
      return;
    }
    setCreating(true);
    setUserError(null);
    try {
      // WebAuthn create must stay in this click handler (user gesture).
      const { credentialId } = await registerOwnerPasskey(v.userName);
      close({ mode: "create", userName: v.userName, credentialId });
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "AbortError")
      ) {
        close({ mode: "cancel" });
        return;
      }
      toast.error(toUserErrorMessage(err, errorCopy.signerFailed.body));
      setCreating(false);
    }
  }, [close, userName]);

  const api = useMemo(() => ({ promptSetup }), [promptSetup]);

  return (
    <PasskeySetupContext.Provider value={api}>
      {children}

      <Dialog
        open={phase?.kind === "chooser"}
        onOpenChange={(open) => {
          if (!open) close({ mode: "cancel" });
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Set up on this phone</DialogTitle>
            <DialogDescription>
              Create a passkey-protected wallet on this phone. If you already set
              one up elsewhere, unlock with that passkey instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2.5 sm:flex-col">
            <Button
              type="button"
              size="lg"
              className="w-full rounded-full"
              onClick={() =>
                setPhase((p) =>
                  p ? { kind: "username", resolve: p.resolve } : null,
                )
              }
            >
              Create a passkey
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="w-full rounded-full"
              onClick={() => close({ mode: "unlock" })}
            >
              I already have a passkey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={phase?.kind === "username"}
        onOpenChange={(open) => {
          if (!open && !creating) close({ mode: "cancel" });
        }}
      >
        <DialogContent
          showCloseButton={false}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{copy.wallet.usernameTitle}</DialogTitle>
            <DialogDescription>{copy.wallet.usernameBody}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="passkey-username">{copy.wallet.usernameLabel}</Label>
            <Input
              id="passkey-username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={USER_NAME_MAX}
              placeholder={copy.wallet.usernamePlaceholder}
              value={userName}
              disabled={creating}
              onChange={(e) => {
                setUserName(e.target.value);
                setUserError(null);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || creating) return;
                e.preventDefault();
                void createWithPasskey();
              }}
            />
            {userError ? (
              <p className="text-sm text-destructive">{userError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {copy.wallet.usernameHint}
              </p>
            )}
          </div>
          <DialogFooter className="flex-col gap-2.5 sm:flex-col">
            <Button
              type="button"
              size="lg"
              className="w-full rounded-full"
              disabled={creating}
              onClick={() => void createWithPasskey()}
            >
              {creating ? "Follow the passkey prompt…" : "Create with passkey"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="w-full rounded-full"
              disabled={creating}
              onClick={() => close({ mode: "cancel" })}
            >
              {copy.common.cancel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PasskeySetupContext.Provider>
  );
}

export function usePasskeySetup(): PasskeySetupApi {
  const ctx = useContext(PasskeySetupContext);
  if (!ctx) {
    throw new Error("usePasskeySetup requires PasskeySetupProvider");
  }
  return ctx;
}
