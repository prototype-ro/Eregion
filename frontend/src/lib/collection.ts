import type { DeckCardLine } from "./types";

/**
 * Basic lands are never something a player has to buy or track: every player has a pile of them. Counting them
 * against the collection made a mono-red deck "need" thirty Mountains.
 */
export function isBasicLand(typeLine: string | null | undefined): boolean {
  return /^Basic\b/.test(typeLine ?? "");
}

/** How many copies of a deck line the player owns, with basic lands always fully owned. */
export function ownedCopies(line: { cardId: string; typeLine: string; quantity: number }, collection: Map<string, number>): number {
  const owned = collection.get(line.cardId) ?? 0;
  return isBasicLand(line.typeLine) ? Math.max(owned, line.quantity) : owned;
}

export interface Need {
  name: string;
  copies: number;
  each: number | null;
}

/** What the deck needs that the collection does not have: the commander and main board, basic lands never counted. */
export function shoppingList(lines: DeckCardLine[]): Need[] {
  const needs = new Map<string, Need>();
  for (const line of lines) {
    if (line.board !== "commander" && line.board !== "main") continue;
    const missing = line.quantity - line.owned;
    if (missing <= 0) continue;
    const known = needs.get(line.name);
    if (known) known.copies += missing;
    else needs.set(line.name, { name: line.name, copies: missing, each: line.priceUsd });
  }
  return [...needs.values()].sort((a, b) => (b.each ?? 0) * b.copies - (a.each ?? 0) * a.copies);
}
