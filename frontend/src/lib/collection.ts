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
