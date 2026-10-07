"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ManaCost } from "@/components/Mana";
import { plural, relativeTime } from "@/lib/deckfilter";
import { formatPrice } from "@/lib/links";
import type { DeckSummary } from "@/lib/types";

interface Props {
  deck: DeckSummary;
  onRename: (deck: DeckSummary) => void;
  onDelete: (deck: DeckSummary) => void;
  onDuplicate: (deck: DeckSummary) => void;
  onVisibility: (deck: DeckSummary, visibility: "public" | "private") => void;
}

const item =
  "flex min-h-11 w-full items-center rounded-xl px-3.5 text-left text-[15px] hover:bg-surface focus:bg-surface focus:outline-none disabled:opacity-40";

/** Where the deck stands as a Commander deck, in a few words. */
export function legalityLabel(deck: DeckSummary): { text: string; good: boolean } | null {
  if (deck.latestVersion === 0) return null;
  if (deck.issues.length === 0) return { text: "Legal", good: true };
  return { text: plural(deck.issues.length, "issue"), good: false };
}

function Art({ deck }: { deck: DeckSummary }) {
  if (deck.artUrls.length === 0) {
    return (
      <div className="flex aspect-[5/4] items-center justify-center rounded-card border border-line bg-surface text-sm text-muted" aria-hidden="true">
        {deck.latestVersion === 0 ? "No cards yet" : "No commander"}
      </div>
    );
  }
  return (
    <div className="relative grid aspect-[5/4] overflow-hidden rounded-card bg-surface" style={{ gridTemplateColumns: `repeat(${deck.artUrls.length}, 1fr)` }}>
      {deck.artUrls.map((url) => (
        <div key={url} className="relative">
          <Image src={url} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover grayscale transition-[filter] duration-300 group-hover:grayscale-0" />
        </div>
      ))}
    </div>
  );
}

/** One deck on the decks page: art, what it is, how it stands, and a menu of things to do with it. */
export function DeckTile({ deck, onRename, onDelete, onDuplicate, onVisibility }: Props) {
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

  const legality = legalityLabel(deck);
  const meta = [
    plural(deck.cardCount, "card"),
    deck.cardCount > 0 ? formatPrice(deck.priceUsd) : null,
    deck.latestVersion > 0 ? `v${deck.latestVersion}${deck.latestOnMain ? "" : ` on ${deck.latestBranch}`}` : null,
    deck.branchCount > 1 ? plural(deck.branchCount, "branch", "branches") : null,
  ].filter(Boolean);

  return (
    <li className="group relative flex flex-col">
      <Art deck={deck} />

      <div className="absolute top-3 right-3 z-10">
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
          <div ref={menu} role="menu" aria-label={`Options for ${deck.name}`} className="absolute top-12 right-0 z-20 w-[240px] rounded-3xl border border-line bg-bg p-2 shadow-2xl">
            <Link role="menuitem" href={`/decks/${deck.id}`} target="_blank" rel="noopener noreferrer" className={item} onClick={() => setOpen(false)}>
              Open in a new tab
            </Link>
            <button role="menuitem" className={item} onClick={act(() => onRename(deck))}>
              Rename
            </button>
            <button role="menuitem" className={item} onClick={act(() => onDuplicate(deck))}>
              Duplicate
            </button>
            {deck.visibility === "public" ? (
              <button role="menuitem" className={item} onClick={act(() => onVisibility(deck, "private"))}>
                Make private
              </button>
            ) : (
              <button role="menuitem" className={item} disabled={deck.latestVersion === 0} onClick={act(() => onVisibility(deck, "public"))}>
                Make public (v{deck.latestVersion})
              </button>
            )}
            <div className="my-1.5 border-t border-line" />
            <button role="menuitem" className={`${item} text-add-text`} onClick={act(() => onDelete(deck))}>
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1 pt-4">
        <h2 className="line-clamp-2 text-xl font-medium tracking-[-0.02em]" title={deck.name}>
          {/* The after pseudo-element stretches the link over the whole tile. */}
          <Link href={`/decks/${deck.id}`} className="after:absolute after:inset-0">
            {deck.name}
          </Link>
        </h2>
        <p className="mt-1 line-clamp-1 text-sm text-muted" title={deck.commanderName ?? undefined}>
          {deck.commanderName ?? "No commander yet"}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {deck.commanderName && <ManaCost cost={deck.colorIdentity ? [...deck.colorIdentity].map((c) => `{${c}}`).join("") : "{C}"} className="text-[18px]" />}
          {legality && (
            <span
              title={deck.issues.join(" ")}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${legality.good ? "border-accent bg-accent font-bold text-on-accent" : "border-line text-muted"}`}
            >
              {legality.text}
            </span>
          )}
          {deck.visibility === "public" && <span className="rounded-full border border-accent-text px-2.5 py-0.5 text-xs text-accent-text">Public</span>}
        </div>

        <p className="mt-3 font-mono text-[12px] leading-relaxed text-muted">{meta.join(", ")}</p>
        <p className="mt-0.5 font-mono text-[12px] text-muted">Edited {relativeTime(deck.updatedAt)}</p>
      </div>
    </li>
  );
}
