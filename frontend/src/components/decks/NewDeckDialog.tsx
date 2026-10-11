"use client";

import Image from "next/image";
import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { useCardSearch } from "@/lib/useCardSearch";
import type { Card } from "@/lib/types";
import { btn, field } from "@/lib/ui";

export interface NewDeckDraft {
  name: string;
  commander: Card | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  error: string | null;
  /** Creates the deck and opens it. */
  onCreate: (draft: NewDeckDraft) => void;
  /** Hands over to the list import. The deck is created once the list is read. */
  onFromList: (draft: NewDeckDraft) => void;
}

/** Start a deck with a name, optionally a commander, or from a pasted list. */
export function NewDeckDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} label="New deck" size="md">
      <Form {...props} />
    </Dialog>
  );
}

function Form({ onClose, busy, error, onCreate, onFromList }: Props) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [commander, setCommander] = useState<Card | null>(null);
  const { results, loading, error: searchError, searchable } = useCardSearch(commander ? "" : query, 6, true);

  const draft: NewDeckDraft = { name: name.trim() || commander?.name || "", commander };
  const canCreate = draft.name !== "" && !busy;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (canCreate) onCreate(draft);
      }}
    >
      <h2 className="font-display text-[44px] leading-none">New deck</h2>

      <div className="flex flex-col gap-2">
        <label htmlFor="new-deck-name" className="text-sm text-muted">
          Deck name
        </label>
        <input
          id="new-deck-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          autoFocus
          placeholder={commander ? commander.name : ""}
          className={field.lg}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">Commander (optional)</p>
        {commander ? (
          <div className="flex items-center gap-4 rounded-2xl border border-line p-3">
            <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">
              {commander.imageArtCrop && <Image src={commander.imageArtCrop} alt="" fill sizes="80px" className="object-cover grayscale" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-medium">{commander.name}</p>
              <p className="truncate font-mono text-xs text-muted">{commander.typeLine}</p>
            </div>
            <button type="button" onClick={() => { setCommander(null); setQuery(""); }} className="pill min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full border border-ink px-4 text-sm font-medium">
              Change
            </button>
          </div>
        ) : (
          <div>
            <label htmlFor="new-deck-commander" className="sr-only">
              Search for a commander
            </label>
            <input
              id="new-deck-commander"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              placeholder="Search legendary creatures"
              className={field.lg}
            />
            {searchable && (
              <div className="mt-2 rounded-2xl border border-line p-1.5">
                {searchError && <p role="alert" className="px-3 py-2 text-sm text-add-text">{searchError}</p>}
                {loading && results.length === 0 && !searchError && <p className="px-3 py-3 text-sm text-muted">Searching.</p>}
                {!loading && !searchError && results.length === 0 && <p className="px-3 py-3 text-sm text-muted">No commander matches that name.</p>}
                <ul>
                  {results.map((card) => (
                    <li key={card.id}>
                      <button type="button" onClick={() => setCommander(card)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-surface focus-visible:bg-surface focus-visible:outline-none">
                        <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                          {card.imageArtCrop && <Image src={card.imageArtCrop} alt="" fill sizes="56px" className="object-cover grayscale" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-medium">{card.name}</span>
                          <span className="block truncate font-mono text-xs text-muted">{card.typeLine}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <button type="submit" disabled={!canCreate} className={btn.large.primary}>
          {busy ? "Creating" : "Create and open"}
        </button>
        <button type="button" onClick={() => onFromList({ name: draft.name, commander })} disabled={busy} className={btn.large.secondary}>
          Start from a list
        </button>
        <button type="button" onClick={onClose} className={btn.large.secondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}
