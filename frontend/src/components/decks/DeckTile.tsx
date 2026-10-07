"use client";

import Image from "next/image";
import Link from "next/link";
import { ManaCost } from "@/components/Mana";
import { plural, relativeTime } from "@/lib/deckfilter";
import { formatPrice } from "@/lib/links";
import type { DeckSummary } from "@/lib/types";
import { DeckMenu, type DeckActions } from "./DeckMenu";

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

/** The facts under a deck's name, shared by the tile and the list row. */
export function deckMeta(deck: DeckSummary): string[] {
  return [
    plural(deck.cardCount, "card"),
    deck.cardCount > 0 ? formatPrice(deck.priceUsd) : null,
    deck.latestVersion > 0 ? `v${deck.latestVersion}${deck.latestOnMain ? "" : ` on ${deck.latestBranch}`}` : null,
    deck.branchCount > 1 ? plural(deck.branchCount, "branch", "branches") : null,
  ].filter((part): part is string => part !== null);
}

/** Color symbols, the legality badge and the public and archived marks. */
export function DeckBadges({ deck }: { deck: DeckSummary }) {
  const legality = legalityLabel(deck);
  return (
    <>
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
      {deck.archived && <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">Archived</span>}
    </>
  );
}

/** A small pin mark in front of a pinned deck's name. */
export function PinMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-label="Pinned" role="img" className="mr-1.5 inline text-accent-text">
      <path d="M9.5 1.5l5 5-1.4 1.4-.9-.4-2.3 2.3.3 3-1.2 1.2-2.7-2.7-4 4-.9-.9 4-4-2.7-2.7L4.9 5.5l3 .3 2.3-2.3-.4-.9L9.5 1.5z" />
    </svg>
  );
}

/** One deck on the decks page: art, what it is, how it stands, and a menu of things to do with it. */
export function DeckTile({ deck, actions }: { deck: DeckSummary; actions: DeckActions }) {
  return (
    <li className={`group relative flex flex-col ${deck.archived ? "opacity-70" : ""}`}>
      <Art deck={deck} />
      <DeckMenu deck={deck} actions={actions} className="absolute top-3 right-3 z-10" />

      <div className="flex flex-1 flex-col px-1 pt-4">
        <h2 className="line-clamp-2 text-xl font-medium tracking-[-0.02em]" title={deck.name}>
          {deck.pinned && <PinMark />}
          {/* The after pseudo-element stretches the link over the whole tile. */}
          <Link href={`/decks/${deck.id}`} className="after:absolute after:inset-0">
            {deck.name}
          </Link>
        </h2>
        <p className="mt-1 line-clamp-1 text-sm text-muted" title={deck.commanderName ?? undefined}>
          {deck.commanderName ?? "No commander yet"}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DeckBadges deck={deck} />
        </div>

        <p className="mt-3 font-mono text-[12px] leading-relaxed text-muted">{deckMeta(deck).join(", ")}</p>
        <p className="mt-0.5 font-mono text-[12px] text-muted">Edited {relativeTime(deck.updatedAt)}</p>
      </div>
    </li>
  );
}

/** A deck as one line, for a long list. */
export function DeckRow({ deck, actions }: { deck: DeckSummary; actions: DeckActions }) {
  return (
    <li className={`group relative grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line py-3 md:grid-cols-[64px_minmax(0,1.4fr)_minmax(0,1.6fr)_160px_auto] ${deck.archived ? "opacity-70" : ""}`}>
      <div className="relative h-12 w-16 overflow-hidden rounded-lg bg-surface" aria-hidden="true">
        {deck.artUrls[0] && <Image src={deck.artUrls[0]} alt="" fill sizes="64px" className="object-cover grayscale" />}
      </div>
      <div className="min-w-0">
        <h2 className="truncate text-[17px] font-medium" title={deck.name}>
          {deck.pinned && <PinMark />}
          <Link href={`/decks/${deck.id}`} className="after:absolute after:inset-0">
            {deck.name}
          </Link>
        </h2>
        <p className="truncate text-sm text-muted">{deck.commanderName ?? "No commander yet"}</p>
      </div>
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <DeckBadges deck={deck} />
      </div>
      <p className="hidden font-mono text-[12px] leading-relaxed text-muted md:block">
        {deckMeta(deck).slice(0, 2).join(", ")}
        <span className="block">Edited {relativeTime(deck.updatedAt)}</span>
      </p>
      <DeckMenu deck={deck} actions={actions} className="relative z-10" />
    </li>
  );
}
