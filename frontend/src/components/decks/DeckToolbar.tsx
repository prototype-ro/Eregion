"use client";

import { SlidersHorizontal } from "@phosphor-icons/react";
import { useState } from "react";
import { SortDirectionButton } from "@/components/builder/SortDirectionButton";
import { ManaCost } from "@/components/Mana";
import { DECK_SORTS, isFiltering, NO_FILTERS, type DeckDirection, type DeckFilters, type DeckSort } from "@/lib/deckfilter";
import { btn, field } from "@/lib/ui";

interface Props {
  filters: DeckFilters;
  onFilters: (filters: DeckFilters) => void;
  sort: DeckSort;
  direction: DeckDirection;
  onSort: (sort: DeckSort) => void;
  onFlip: () => void;
  shown: number;
  total: number;
  view: "grid" | "list";
  onView: (view: "grid" | "list") => void;
}

const select = field.md;
const COLORS = ["W", "U", "B", "R", "G", "C"];
const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless" };

/** Search, filters and sorting for the list of decks. */
export function DeckToolbar({ filters, onFilters, sort, direction, onSort, onFlip, shown, total, view, onView }: Props) {
  const set = (patch: Partial<DeckFilters>) => onFilters({ ...filters, ...patch });
  // Phones show the search and the layout switch; sort and filters fold into one button.
  const [open, setOpen] = useState(false);
  const active = [filters.visibility !== "all", filters.status !== "active", filters.legality !== "all", filters.colors.length > 0].filter(Boolean).length;

  function toggleColor(color: string) {
    if (color === "C") return set({ colors: filters.colors.includes("C") ? [] : ["C"] });
    const others = filters.colors.filter((c) => c !== "C");
    set({ colors: others.includes(color) ? others.filter((c) => c !== color) : [...others, color] });
  }

  return (
    <div className="flex flex-col gap-4 border-t border-line py-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto md:max-w-[460px]">
          <label htmlFor="deck-search" className="sr-only">
            Search your decks
          </label>
          <input
            id="deck-search"
            type="search"
            value={filters.query}
            onChange={(event) => set({ query: event.target.value })}
            placeholder="Search by deck or commander"
            autoComplete="off"
            className={field.lg}
          />
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls="deck-filters"
          onClick={() => setOpen((value) => !value)}
          className={`${btn.secondary} md:hidden`}
        >
          <SlidersHorizontal size={18} aria-hidden />
          Filters{active > 0 ? ` (${active})` : ""}
        </button>
        <div className="ml-auto flex gap-1 rounded-full border border-line p-1 md:order-last" role="group" aria-label="Layout">
          {(["grid", "list"] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={view === mode} onClick={() => onView(mode)} className={`min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full px-4 text-sm capitalize ${view === mode ? "bg-ink text-bg" : ""}`}>
              {mode}
            </button>
          ))}
        </div>

      </div>

      <div id="deck-filters" className={`${open ? "flex" : "hidden"} flex-wrap items-center gap-x-6 gap-y-3 md:flex`}>
        <div className="flex items-center gap-3">
          <label htmlFor="deck-sort" className="text-sm text-muted">
            Sort by
          </label>
          <select id="deck-sort" value={sort} onChange={(event) => onSort(event.target.value as DeckSort)} className={select}>
            {DECK_SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <SortDirectionButton direction={direction} onFlip={onFlip} />
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="deck-visibility" className="text-sm text-muted">
            Visibility
          </label>
          <select id="deck-visibility" value={filters.visibility} onChange={(event) => set({ visibility: event.target.value as DeckFilters["visibility"] })} className={select}>
            <option value="all">All</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="deck-status" className="text-sm text-muted">
            Show
          </label>
          <select id="deck-status" value={filters.status} onChange={(event) => set({ status: event.target.value as DeckFilters["status"] })} className={select}>
            <option value="active">Active decks</option>
            <option value="archived">Archived</option>
            <option value="all">Everything</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="deck-legality" className="text-sm text-muted">
            Legality
          </label>
          <select id="deck-legality" value={filters.legality} onChange={(event) => set({ legality: event.target.value as DeckFilters["legality"] })} className={select}>
            <option value="all">All</option>
            <option value="legal">Legal</option>
            <option value="issues">Needs work</option>
          </select>
        </div>

        <div className="flex items-center gap-3" role="group" aria-label="Commander colors">
          <span className="text-sm text-muted">Colors</span>
          <div className="flex gap-1.5">
            {COLORS.map((color) => {
              const on = filters.colors.includes(color);
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={on}
                  aria-label={COLOR_NAMES[color]}
                  title={COLOR_NAMES[color]}
                  onClick={() => toggleColor(color)}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border text-[20px] transition-opacity ${on ? "border-accent-text bg-surface" : "border-line opacity-60 hover:opacity-100"}`}
                >
                  <ManaCost cost={`{${color}}`} />
                </button>
              );
            })}
          </div>
        </div>

        <p className="ml-auto flex items-center gap-4 text-sm text-muted" role="status">
          {isFiltering(filters) ? `${shown} of ${total} decks` : `${total} ${total === 1 ? "deck" : "decks"}`}
          {isFiltering(filters) && (
            <button type="button" onClick={() => onFilters({ ...NO_FILTERS })} className="text-accent-text underline underline-offset-4">
              Clear filters
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
