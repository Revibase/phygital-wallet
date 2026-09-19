"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useOwnerWallet } from "@/hooks/wallet/use-owner-wallet";
import { errorCopy } from "@/lib/copy/phygital";
import {
  isOwnerSessionRequiredError,
  mintOwnerBrowse,
} from "@/lib/wallet/owner-session";
import { walletHref } from "@/lib/wallet/token-routes";
import { toUserErrorMessage } from "@/lib/user-errors";

/** Quietly mint owner_browse for a PDA, then navigate — Face ID only if session cold. */
export function useOpenOwnedAccessory() {
  const router = useRouter();
  const { login } = useOwnerWallet();
  const [openingToken, setOpeningToken] = useState<string | null>(null);
  const busyRef = useRef(false);

  const open = useCallback(
    async (phygitalToken: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setOpeningToken(phygitalToken);
      try {
        try {
          await mintOwnerBrowse(phygitalToken);
        } catch (err) {
          if (!isOwnerSessionRequiredError(err)) throw err;
          await login();
          await mintOwnerBrowse(phygitalToken);
        }
        router.push(walletHref(phygitalToken));
      } catch (err) {
        toast.error(toUserErrorMessage(err, errorCopy.signerFailed.body));
      } finally {
        busyRef.current = false;
        setOpeningToken(null);
      }
    },
    [login, router],
  );

  return { open, openingToken };
}
