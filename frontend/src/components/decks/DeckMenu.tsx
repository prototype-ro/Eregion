"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DeckSummary } from "@/lib/types";

export interface DeckActions {
  onRename: (deck: DeckSummary) => void;
  onDelete: (deck: DeckSummary) => void;
  onDuplicate: (deck: DeckSummary) => void;
  onVisibility: (deck: DeckSummary, visibility: "public" | "private") => void;
  onPin: (deck: DeckSummary) => void;
  onArchive: (deck: DeckSummary) => void;
}

const item =
  "flex min-h-9 [@media(pointer:coarse)]:min-h-11 w-full items-center rounded-xl px-3.5 text-left text-[15px] hover:bg-surface focus:bg-surface focus:outline-none disabled:opacity-40";

/** The "..." button of a deck and the menu of things to do with it. */
export function DeckMenu({ deck, actions, className = "relative" }: { deck: DeckSummary; actions: DeckActions; className?: string }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          setOpen(false);
          button.current?.focus();
        }
        return;
      }
      if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className={className}>
      <button
        ref={button}
        type="button"
        aria-label={`Options for ${deck.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-bg/85 text-xl leading-none text-ink backdrop-blur hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent-text"
      >
        <span aria-hidden="true">...</span>
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label={`Options for ${deck.name}`} className="absolute top-12 right-0 z-30 w-[250px] rounded-3xl border border-line bg-bg p-2 shadow-2xl">
          <Link role="menuitem" href={`/decks/${deck.id}`} target="_blank" rel="noopener noreferrer" className={item} onClick={() => setOpen(false)}>
            Open in a new tab
          </Link>
          <button role="menuitem" className={item} onClick={act(() => actions.onPin(deck))}>
            {deck.pinned ? "Unpin from the top" : "Pin to the top"}
          </button>
          <button role="menuitem" className={item} onClick={act(() => actions.onRename(deck))}>
            Rename
          </button>
          <button role="menuitem" className={item} onClick={act(() => actions.onDuplicate(deck))}>
            Duplicate
          </button>
          {deck.visibility === "public" ? (
            <button role="menuitem" className={item} onClick={act(() => actions.onVisibility(deck, "private"))}>
              Make private
            </button>
          ) : (
            <button role="menuitem" className={item} disabled={deck.latestVersion === 0} onClick={act(() => actions.onVisibility(deck, "public"))}>
              Make public (v{deck.latestVersion})
            </button>
          )}
          <button role="menuitem" className={item} onClick={act(() => actions.onArchive(deck))}>
            {deck.archived ? "Restore from the archive" : "Archive"}
          </button>
          <div className="my-1.5 border-t border-line" />
          <button role="menuitem" className={`${item} text-danger`} onClick={act(() => actions.onDelete(deck))}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
