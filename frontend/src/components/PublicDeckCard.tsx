import Link from "next/link";
import { BracketPill } from "@/components/BracketPill";
import { CardArt } from "@/components/CardArt";
import { formatPrice, sortColors } from "@/lib/links";
import type { PublicDeck } from "@/lib/types";

/** A public deck in a grid: its commander's art, name, bracket and facts. The whole card links to the deck. */
export function PublicDeckCard({ deck }: { deck: PublicDeck }) {
  return (
    <li className="group relative">
      {deck.artUrl ? (
        <CardArt src={deck.artUrl} alt={`${deck.commanderName ?? deck.name} card art`} sizes="(min-width: 1024px) 25vw, 50vw" className="aspect-[4/5] rounded-card" />
      ) : (
        <div className="aspect-[4/5] rounded-card border border-line bg-surface" aria-hidden="true" />
      )}
      <div className="px-1 pt-4">
        <h2 className="text-xl font-medium tracking-[-0.02em]">
          <Link href={`/explore/${deck.id}`} className="after:absolute after:inset-0">
            {deck.name}
          </Link>
        </h2>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
          {deck.commanderName ?? "No commander"}
          <BracketPill bracket={deck.bracket} name={deck.bracketName} />
        </p>
        <p className="mt-1 font-mono text-[13px] text-muted">
          by {deck.mine ? "you" : deck.ownerName}, v{deck.versionNumber}, {deck.cardCount} cards, {formatPrice(deck.priceUsd)}
          {deck.colorIdentity ? `, ${sortColors(deck.colorIdentity)}` : ""}
        </p>
      </div>
    </li>
  );
}
