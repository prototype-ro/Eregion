import type { LoreDoc, LoreGroup } from "./types";

export interface TierOption {
  /** What is sent to the server: the lore group's own name, exactly. */
  value: string;
  /** What the player reads. */
  label: string;
}

/** What a dragon of this tier is called, read from a group's traits ("Dragons: the Hoard-lord — darker hide ..."), or null. */
function dragonForm(group: LoreGroup): string | null {
  const match = /Dragons?:\s*the\s+(.+?)\s+[\u2014\u2013]\s/i.exec(group.traits ?? "");
  return match ? match[1].trim() : null;
}

/**
 * The tiers a card can be placed in. The groups of the lore that name a dragon form are the tiers, each labelled with that form; a lore that has none of
 * those offers the groups whose name says tier, transformation or submitted, so the picker still works for another deck.
 */
export function tierOptions(doc: LoreDoc | null | undefined): TierOption[] {
  const groups = doc?.groups ?? [];
  const withForm = groups.filter((group) => dragonForm(group) !== null);
  if (withForm.length > 0) {
    return withForm.map((group) => ({ value: group.name, label: `${dragonForm(group)} (${group.name})` }));
  }
  return groups.filter((group) => /tier|transformation|submitted/i.test(group.name)).map((group) => ({ value: group.name, label: group.name }));
}
