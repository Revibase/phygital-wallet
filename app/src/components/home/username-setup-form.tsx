"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  FieldError,
  FieldHint,
  FieldLabel,
  Input,
} from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { copy } from "@/lib/copy/phygital";
import { parseUsername, usernameHint } from "@/lib/username";

/** Collect a Twitter-style username before platform passkey registration. */
export function UsernameSetupForm({
  eyebrow,
  title,
  body,
  busy,
  error,
  onSubmit,
  onBack,
}: {
  eyebrow?: string | null;
  title: string;
  body: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (username: string) => void;
  onBack?: () => void;
}) {
  const [value, setValue] = useState("");
  const parsed = parseUsername(value);
  const hint = usernameHint(value);
  const showHint = value.trim().length > 0 && hint;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-eyebrow text-primary/80">{eyebrow}</p>
        ) : null}
        <h1 className="text-large-title tracking-tight">{title}</h1>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
          {error ?? body}
        </p>
      </div>
      <form
        className="flex w-full max-w-sm flex-col gap-3 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed || busy) return;
          onSubmit(parsed.display);
        }}
      >
        <div className="space-y-1.5">
          <FieldLabel htmlFor="revibase-username">
            {copy.wallet.usernameLabel}
          </FieldLabel>
          <div className="relative">
            <span
              className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-base text-muted-foreground"
              aria-hidden
            >
              @
            </span>
            <Input
              id="revibase-username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              maxLength={16}
              placeholder={copy.wallet.usernamePlaceholder}
              value={value}
              disabled={busy}
              aria-invalid={Boolean(showHint || error)}
              className="pl-8"
              onChange={(e) => setValue(e.target.value.replace(/^@+/, ""))}
            />
          </div>
          {showHint ? (
            <FieldError>{hint}</FieldError>
          ) : (
            <FieldHint>{copy.wallet.usernameHint}</FieldHint>
          )}
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full rounded-full"
          disabled={busy || !parsed}
        >
          {busy ? <Spinner className="size-4" /> : copy.wallet.usernameContinue}
        </Button>
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full rounded-full"
            disabled={busy}
            onClick={onBack}
          >
            {copy.common.back}
          </Button>
        ) : null}
      </form>
    </div>
  );
}
