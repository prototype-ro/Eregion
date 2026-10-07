"use client";

import Image from "next/image";
import { useState } from "react";
import { useCardSearch } from "@/lib/useCardSearch";
import type { Card } from "@/lib/types";

interface Props {
  token: string;
  /** Ids of cards already in the deck, so results can offer "Add another". */
  inDeck: Set<string>;
  owned: Map<string, number>;
  /** Show whether each result is in your collection. */
  showCollection: boolean;
  onAdd: (card: Card) => void;
  onSetCommander: (card: Card) => void;
}

export function CardSearch({ token, inDeck, owned, showCollection, onAdd, onSetCommander }: Props) {
  const [query, setQuery] = useState("");
  const { results, loading, error, searchable } = useCardSearch(query, token);

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        // Escape from the box or from a result button leaves the search: empty it and drop focus.
        if (event.key === "Escape") {
          event.preventDefault();
          setQuery("");
          (document.activeElement as HTMLElement | null)?.blur();
        }
      }}
    >
      <label htmlFor="card-search" className="mb-2 block text-sm text-muted">
        Add a card
      </label>
      <input
        id="card-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
        placeholder="Search by card name"
        className="min-h-14 w-full rounded-full border border-line bg-surface px-6 text-[17px] text-ink placeholder:text-muted focus:border-ink focus:outline-none"
      />

      {searchable && (
        <div className="absolute top-full right-0 left-0 z-10 mt-2 max-h-[520px] overflow-auto rounded-3xl border border-line bg-bg p-2 shadow-2xl">
          {error && (
            <p role="alert" className="px-4 py-3 text-sm text-add-text">
              {error}
            </p>
          )}
          {loading && results.length === 0 && !error && <p className="px-4 py-4 text-muted">Searching.</p>}
          {!loading && !error && results.length === 0 && (
            <p className="px-4 py-4 text-muted">No card matches that name.</p>
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
                      {card.manaCost ? `, ${card.manaCost}` : ""}
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
                    {card.typeLine.includes("Legendary") && card.typeLine.includes("Creature") && (
                      <button
                        type="button"
                        onClick={() => onSetCommander(card)}
                        className="pill min-h-11 rounded-full border border-ink px-4 text-sm font-medium"
                      >
                        Commander
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onAdd(card)}
                      className="press min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-on-accent"
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
