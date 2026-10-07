import type { DeckCardLine } from "./types";

/** The fields that describe which printing, or which custom art, a line shows. */
const ART_FIELDS = ["printingId", "customPrintingId", "setCode", "setName", "collectorNumber", "rarity", "artist", "imageSmall", "imageNormal", "imageArtCrop", "priceUsd"] as const;

/**
 * When a list is imported into a deck that already has cards, a card that was in the deck keeps the art
 * that was chosen for it: the printing, or the player's own custom art. Cards that were not in the deck show
 * their default art. A card that had custom art wins over one that only had a printing, since custom art takes more effort to choose.
 */
export function inheritArt(previous: DeckCardLine[], incoming: DeckCardLine[]): { lines: DeckCardLine[]; inherited: number } {
  const chosen = new Map<string, DeckCardLine>();
  for (const line of previous) {
    const seen = chosen.get(line.cardId);
    if (!seen || (seen.customPrintingId === null && line.customPrintingId !== null)) chosen.set(line.cardId, line);
  }

  let inherited = 0;
  const lines = incoming.map((line) => {
    const before = chosen.get(line.cardId);
    if (!before) return line;
    const sameArt = ART_FIELDS.every((field) => before[field] === line[field]);
    if (sameArt) return line;
    inherited += 1;
    const next = { ...line };
    for (const field of ART_FIELDS) (next as Record<string, unknown>)[field] = before[field];
    return next;
  });
  return { lines, inherited };
}
