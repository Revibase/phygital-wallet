"use client";

import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { useRpcPreference } from "@/hooks/wallet/use-rpc-preference";
import { copy } from "@/lib/copy/phygital";
import { displayRpcEndpoint } from "@/lib/solana/rpc-preference";
import { toUserErrorMessage } from "@/lib/user-errors";
import { cn } from "@/lib/utils";

type View = "menu" | "custom";

/** Settings → RPC Connection (Backpack-style default / custom). */
export function RpcConnectionSheet({ onBack }: { onBack: () => void }) {
  const rpc = useRpcPreference();
  const [view, setView] = useState<View>("menu");
  const [draft, setDraft] = useState(
    rpc.preference.mode === "custom" ? rpc.preference.url : "https://",
  );

  function useDefault() {
    rpc.setDefault();
    toast.success(copy.wallet.rpcSwitchedDefault);
    onBack();
  }

  function useCustom() {
    try {
      rpc.setCustom(draft);
      toast.success(copy.wallet.rpcSwitchedCustom);
      onBack();
    } catch (e) {
      toast.error(toUserErrorMessage(e));
    }
  }

  if (view === "custom") {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <NavBar
          leading={
            <NavBarBack onClick={() => setView("menu")} />
          }
          title={copy.wallet.rpcCustom}
        />
        <p className="text-sm text-muted-foreground">{copy.wallet.rpcCustomHint}</p>
        <FieldLabel className="normal-case tracking-normal text-xs">
          {copy.wallet.rpcUrlLabel}
        </FieldLabel>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://…rpc…/?api-key=…"
          className="font-mono text-sm"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Button
          type="button"
          size="lg"
          onClick={() => useCustom()}
        >
          {copy.wallet.rpcSwitch}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <NavBar
        leading={<NavBarBack onClick={onBack} desktopHidden />}
        title={copy.wallet.rpcConnection}
      />
      <p className="text-sm text-muted-foreground">{copy.wallet.rpcBody}</p>

      <Button
        type="button"
        variant="ghost"
        onClick={() => useDefault()}
        className={cn(
          "h-auto min-h-11 w-full justify-between rounded-2xl bg-muted/25 px-4 py-4 text-left font-normal hover:bg-muted/40",
          !rpc.isCustom && "ring-1 ring-primary/40",
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">{copy.wallet.rpcDefault}</p>
          <p className="truncate text-xs text-muted-foreground">
            {displayRpcEndpoint(rpc.defaultRpcUrl)}
          </p>
        </div>
        {!rpc.isCustom ? (
          <Check className="size-4 shrink-0 text-primary" />
        ) : null}
      </Button>

      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setDraft(
            rpc.preference.mode === "custom" ? rpc.preference.url : "https://",
          );
          setView("custom");
        }}
        className={cn(
          "h-auto min-h-11 w-full justify-between rounded-2xl bg-muted/25 px-4 py-4 text-left font-normal hover:bg-muted/40",
          rpc.isCustom && "ring-1 ring-primary/40",
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">{copy.wallet.rpcCustom}</p>
          <p className="truncate text-xs text-muted-foreground">
            {rpc.isCustom && rpc.displayEndpoint
              ? rpc.displayEndpoint
              : copy.wallet.rpcCustomPrompt}
          </p>
        </div>
        {rpc.isCustom ? (
          <Check className="size-4 shrink-0 text-primary" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}
