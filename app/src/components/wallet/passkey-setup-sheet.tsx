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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { copy, errorCopy } from "@/lib/copy/phygital";
import { registerOwnerPasskey } from "@/lib/wallet/register-owner-passkey";
import { toUserErrorMessage } from "@/lib/user-errors";

const USER_NAME_MIN = 3;
const USER_NAME_MAX = 32;
const USER_NAME_RE = /^[a-zA-Z0-9._-]+$/;

function validateUserName(
  raw: string,
): { ok: true; userName: string } | { ok: false; reason: string } {
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
  /** First-time Continue: unlock vs create (app UI, then signer iframe). */
  promptSetup: () => Promise<PasskeySetupChoice>;
};

const PasskeySetupContext = createContext<PasskeySetupApi | null>(null);

/**
 * Phone identity chooser — one bottom sheet (signer-family), phase push for
 * username. Unlock is primary so returning passkey users aren’t create-first.
 * WebAuthn create stays in the username CTA click (user gesture).
 */
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
  const open = phase !== null;

  return (
    <PasskeySetupContext.Provider value={api}>
      {children}

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next && !creating) close({ mode: "cancel" });
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="gap-0 rounded-t-3xl border-border/50 bg-background p-0 md:max-w-md"
          onOpenAutoFocus={(e) => {
            if (phase?.kind === "username") e.preventDefault();
          }}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted md:hidden" />
          {phase?.kind === "chooser" ? (
            <>
              <SheetHeader className="gap-1.5 px-5 pt-4 pb-2 text-left">
                <SheetTitle>{copy.wallet.setUpThisPhone}</SheetTitle>
                <SheetDescription>
                  {copy.wallet.setUpThisPhoneBody}
                </SheetDescription>
              </SheetHeader>
              <SheetFooter className="flex-col gap-2.5 px-5 pt-2 pb-5 sm:flex-col">
                <Button
                  type="button"
                  size="lg"
                  className="w-full rounded-full"
                  onClick={() => close({ mode: "unlock" })}
                >
                  {copy.wallet.passkeyUnlockCta}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="w-full rounded-full"
                  onClick={() =>
                    setPhase((p) =>
                      p ? { kind: "username", resolve: p.resolve } : null,
                    )
                  }
                >
                  {copy.wallet.passkeyCreateCta}
                </Button>
              </SheetFooter>
            </>
          ) : phase?.kind === "username" ? (
            <>
              <SheetHeader className="gap-1.5 px-5 pt-4 pb-2 text-left">
                <SheetTitle>{copy.wallet.usernameTitle}</SheetTitle>
                <SheetDescription>{copy.wallet.usernameBody}</SheetDescription>
              </SheetHeader>
              <div className="space-y-2 px-5 py-2">
                <Label htmlFor="passkey-username">
                  {copy.wallet.usernameLabel}
                </Label>
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
              <SheetFooter className="flex-col gap-2.5 px-5 pt-2 pb-5 sm:flex-col">
                <Button
                  type="button"
                  size="lg"
                  className="w-full rounded-full"
                  disabled={creating}
                  onClick={() => void createWithPasskey()}
                >
                  {creating
                    ? copy.wallet.passkeyCreating
                    : copy.wallet.usernameContinue}
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
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
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
