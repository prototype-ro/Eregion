"use client";

import Image from "next/image";
import { ManaCost } from "@/components/Mana";
import { useEffect, useRef, useState } from "react";
import { field } from "@/lib/ui";
import { useCardSearch } from "@/lib/useCardSearch";
import type { Board, Card } from "@/lib/types";

interface Props {
  /** Ids of cards already in the deck, so results can offer "Add another". */
  inDeck: Set<string>;
  owned: Map<string, number>;
  /** Show whether each result is in your collection. */
  showCollection: boolean;
  onAdd: (card: Card) => void;
  onSetCommander: (card: Card) => void;
  /** Where the cards found go. Tokens are searched for as tokens. The main search is for the deck itself. */
  board?: Board;
  /** A smaller box with its own label, for the boards under the deck. */
  compact?: boolean;
  /** The search in the bottom dock: bare field, results open upward. */
  dock?: boolean;
  label?: string;
  placeholder?: string;
}

export function CardSearch({ inDeck, owned, showCollection, onAdd, onSetCommander, board = "main", compact = false, dock = false, label = "Add a card", placeholder = "Search by card name" }: Props) {
  const inputId = board === "main" ? "card-search" : `card-search-${board}`;
  const [query, setQuery] = useState("");
  // Whether the list of results is showing. Typing or clicking into the box opens it, and Escape or a click anywhere else closes it
  // without throwing away what was typed.
  const [open, setOpen] = useState(true);
  const wrapper = useRef<HTMLDivElement>(null);
  const { results, loading, error, searchable } = useCardSearch(query, 8, false, board === "tokens");

  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  return (
    <div
      ref={wrapper}
      className={dock ? undefined : "relative"}
      onKeyDown={(event) => {
        // Escape closes the results first, and keeps the text. Pressed again, with nothing open, it empties the box and leaves it.
        if (event.key === "Escape") {
          event.preventDefault();
          if (open && searchable) {
            setOpen(false);
            document.getElementById(inputId)?.focus();
          } else {
            setQuery("");
            (document.activeElement as HTMLElement | null)?.blur();
          }
        }
      }}
    >
      <label htmlFor={inputId} className={compact || dock ? "sr-only" : "mb-2 block text-sm text-muted"}>
        {label}
      </label>
      <input
        id={inputId}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        autoComplete="off"
        placeholder={placeholder}
        className={dock ? "min-h-9 w-full rounded-full bg-transparent px-2 text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:outline-none [@media(pointer:coarse)]:min-h-11" : compact ? field.md : "min-h-14 w-full rounded-full border border-line bg-surface px-6 text-[17px] text-ink placeholder:text-muted focus:border-ink focus:outline-none"}
      />

      {searchable && open && (
        <div className={`absolute z-10 overflow-auto rounded-3xl border border-line bg-bg p-2 shadow-2xl ${dock ? "bottom-full left-0 mb-4 max-h-[min(520px,60vh)] w-[min(620px,100%)]" : `top-full right-0 mt-2 max-h-[520px] ${compact ? "w-[min(460px,92vw)]" : "left-0"}`}`}>
          {error && (
            <p role="alert" className="px-4 py-3 text-sm text-add-text">
              {error}
            </p>
          )}
          {loading && results.length === 0 && !error && <p className="px-4 py-4 text-muted">Searching.</p>}
          {!loading && !error && results.length === 0 && (
            <p className="px-4 py-4 text-muted">{board === "tokens" ? "No token matches that name." : "No card matches that name."}</p>
          )}

          <ul>
            {results.map((card) => {
              const have = owned.get(card.id) ?? 0;
              const already = inDeck.has(card.id);
              return (
                <li
                  key={card.id}
                  className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl px-3 py-2.5 sm:grid-cols-[72px_minmax(0,1fr)_auto_auto]"
                >
                  <div className="relative h-[52px] w-[72px] overflow-hidden rounded-xl bg-surface-2">
                    {card.imageArtCrop && (
                      <Image
                        src={card.imageArtCrop}
                        alt=""
                        fill
                        sizes="72px"
                        className="object-cover grayscale"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[17px] font-medium">{card.name}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted">
                      {card.typeLine}
                      {card.manaCost && (
                        <>
                          , <ManaCost cost={card.manaCost} className="text-[15px]" />
                        </>
                      )}
                    </p>
                  </div>
                  {showCollection ? (
                    <p
                      className={`hidden rounded-full border px-3 py-1 text-[13px] whitespace-nowrap sm:block ${
                        have > 0 ? "border-line text-ink" : "border-add-line text-add-text"
                      }`}
                    >
                      {have > 0 ? `Own ${have}` : "Not owned"}
                    </p>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                  <div className="flex gap-2">
                    {board === "main" && card.typeLine.includes("Legendary") && card.typeLine.includes("Creature") && (
                      <button
                        type="button"
                        onClick={() => onSetCommander(card)}
                        className="pill min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full border border-ink px-4 text-sm font-medium"
                      >
                        Commander
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onAdd(card)}
                      className="press min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-on-accent"
                    >
                      {already ? "Add another" : "Add"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
