"use client";

import { Trash2 } from "lucide-react";

import { NavBar, NavBarBack } from "@/components/shared/nav-bar";
import { GroupedList, GroupedRow } from "@/components/shared/grouped-list";
import { Button } from "@/components/ui/button";
import { useAddressBook } from "@/hooks/wallet/use-address-book";
import { copy } from "@/lib/copy/phygital";
import { removeAddressBookEntry } from "@/lib/wallet/address-book";
import { shortAddress } from "@/lib/utils";

/** Settings → Contacts — device-local address book. */
export function ContactsSheet({ onBack }: { onBack: () => void }) {
  const contacts = useAddressBook();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <NavBar
        leading={<NavBarBack onClick={onBack} />}
        title={copy.wallet.contacts}
      />

      {contacts.length === 0 ? (
        <div className="space-y-2 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">{copy.wallet.noContacts}</p>
          <p className="text-xs text-muted-foreground">{copy.wallet.contactsHint}</p>
        </div>
      ) : (
        <GroupedList footer={copy.wallet.contactsHint}>
          {contacts.map((entry) => (
            <GroupedRow
              key={entry.address}
              subtitle={
                <span className="font-mono tabular-nums">
                  {shortAddress(entry.address, 6)}
                  {entry.note ? ` · ${entry.note}` : ""}
                </span>
              }
              trailing={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={copy.wallet.removeContact}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAddressBookEntry(entry.address);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              }
            >
              {entry.name}
            </GroupedRow>
          ))}
        </GroupedList>
      )}
    </div>
  );
}
