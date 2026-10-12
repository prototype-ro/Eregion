import { OTHER, ROLE_ORDER, roleFolder, UNCATEGORIZED } from "./roles.ts";
import type { DeckCardLine } from "./types";

export type GroupMode = "type" | "role" | "subtype" | "typeTags" | "color" | "identity" | "mv" | "rarity" | "set" | "tag";

export const GROUP_MODES: Array<[GroupMode, string]> = [
  ["type", "Type"],
  ["role", "Role"],
  ["subtype", "Subtype"],
  ["typeTags", "Type & tags"],
  ["color", "Color"],
  ["identity", "Color identity"],
  ["mv", "Mana value"],
  ["rarity", "Rarity"],
  ["set", "Set"],
  ["tag", "Custom tag"],
];

/** How cards are ordered inside each group. */
export type SortMode = "name" | "mv" | "price" | "rarity" | "color";

export const SORT_MODES: Array<[SortMode, string]> = [
  ["name", "Name"],
  ["mv", "Mana value"],
  ["price", "Price"],
  ["rarity", "Rarity"],
  ["color", "Color"],
];

export interface LineGroup {
  title: string;
  lines: DeckCardLine[];
}

const TYPE_GROUPS: Array<[string, string]> = [
  ["Creature", "Creatures"],
  ["Planeswalker", "Planeswalkers"],
  ["Instant", "Instants"],
  ["Sorcery", "Sorceries"],
  ["Artifact", "Artifacts"],
  ["Enchantment", "Enchantments"],
  ["Land", "Lands"],
  ["Battle", "Battles"],
  ["Other", "Other"],
];

const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
const COLOR_ORDER = ["White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Lands"];
const RARITY_ORDER = ["mythic", "rare", "uncommon", "common", "special", "bonus"];
export const UNTAGGED = "Untagged";
const NO_SUBTYPE = "No subtype";
const CUSTOM_ART = "Custom art";

type Compare = (a: DeckCardLine, b: DeckCardLine) => number;

const byName: Compare = (a, b) => a.name.localeCompare(b.name);

export type SortDirection = "asc" | "desc";

/**
 * Ascending is name A to Z, mana value low to high, price low to high, rarity common to mythic and
 * colors in the game's order. Descending reverses that. Ties always fall back to the name, A to Z, and
 * a card with no price always goes last.
 */
export function comparator(sort: SortMode, direction: SortDirection = "asc"): Compare {
  const sign = direction === "asc" ? 1 : -1;
  const then = (primary: Compare): Compare => (a, b) => sign * primary(a, b) || byName(a, b);
  switch (sort) {
    case "mv":
      return then((a, b) => a.manaValue - b.manaValue);
    case "price":
      return (a, b) => {
        if (a.priceUsd === null || b.priceUsd === null) {
          if (a.priceUsd === b.priceUsd) return byName(a, b);
          return a.priceUsd === null ? 1 : -1;
        }
        return sign * (a.priceUsd - b.priceUsd) || byName(a, b);
      };
    case "rarity":
      // RARITY_ORDER runs mythic first, so common to mythic is the reverse of it.
      return then((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity));
    case "color":
      return then((a, b) => COLOR_ORDER.indexOf(colorGroup(a)) - COLOR_ORDER.indexOf(colorGroup(b)));
    default:
      return sign === 1 ? byName : (a, b) => byName(b, a);
  }
}

const rarityRank = (rarity: string) => {
  const index = RARITY_ORDER.indexOf(rarity.toLowerCase());
  return index === -1 ? RARITY_ORDER.length : index;
};

const IDENTITY_NAMES: Record<string, string> = {
  W: "White", U: "Blue", B: "Black", R: "Red", G: "Green",
  WU: "Azorius", UB: "Dimir", BR: "Rakdos", RG: "Gruul", WG: "Selesnya",
  WB: "Orzhov", UR: "Izzet", BG: "Golgari", WR: "Boros", UG: "Simic",
  WUB: "Esper", UBR: "Grixis", BRG: "Jund", WRG: "Naya", WUG: "Bant",
  WBG: "Abzan", WUR: "Jeskai", UBG: "Sultai", WBR: "Mardu", URG: "Temur",
  WUBR: "Yore-Tiller", UBRG: "Glint-Eye", WBRG: "Dune-Brood", WURG: "Ink-Treader", WUBG: "Witch-Maw",
  WUBRG: "Five-color",
};

/** Colors in the game's own order, so "BW" and "WB" are the same identity. */
export function identityKey(line: DeckCardLine): string {
  return "WUBRG".split("").filter((color) => line.colorIdentity.includes(color)).join("");
}

export function identityTitle(key: string): string {
  return key === "" ? "Colorless" : (IDENTITY_NAMES[key] ?? key);
}

/** Identities from colorless through each single color, then pairs, trios and so on. */
const identityOrder = (a: string, b: string) => a.length - b.length || "WUBRG".indexOf(a[0] ?? "") - "WUBRG".indexOf(b[0] ?? "") || a.localeCompare(b);

/** The creature types and other subtypes after the dash in a type line. Both faces of a double-faced card count. */
export function subtypes(typeLine: string): string[] {
  const found = new Set<string>();
  for (const face of typeLine.split("//")) {
    const parts = face.split(/\s[\u2014\u2013-]\s/);
    if (parts.length < 2) continue;
    parts.slice(1).join(" ").split(/\s+/).filter(Boolean).forEach((type) => found.add(type));
  }
  return [...found];
}

/** Which color group a card sits in. Lands keep their own group so they do not bury the colorless cards. */
export function colorGroup(line: DeckCardLine): string {
  if (line.primaryType === "Land") return "Lands";
  if (line.colors.length === 0) return "Colorless";
  if (line.colors.length > 1) return "Multicolor";
  return COLOR_NAMES[line.colors] ?? "Colorless";
}

const capitalize = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : "Unknown");

/** Collects the lines into named groups, in the order the groups should appear. */
function bucket(lines: DeckCardLine[], keys: (line: DeckCardLine) => string[], order: string[], compare: Compare = byName): LineGroup[] {
  const map = new Map<string, DeckCardLine[]>();
  for (const line of lines) {
    for (const key of keys(line)) {
      const list = map.get(key) ?? [];
      list.push(line);
      map.set(key, list);
    }
  }
  const known = order.filter((key) => map.has(key));
  const extra = [...map.keys()].filter((key) => !order.includes(key)).sort((a, b) => a.localeCompare(b));
  return [...known, ...extra].map((key) => ({ title: key, lines: (map.get(key) ?? []).sort(compare) }));
}

/** Groups by primary type in the usual order. */
function typeGroups(lines: DeckCardLine[], compare: Compare): LineGroup[] {
  const groups: LineGroup[] = [];
  for (const [type, title] of TYPE_GROUPS) {
    const matching = lines.filter((line) => line.primaryType === type).sort(compare);
    if (matching.length) groups.push({ title, lines: matching });
  }
  return groups;
}

/** The set a card's shown printing belongs to. The player's own art is kept apart. */
function setTitle(line: DeckCardLine): string {
  if (line.customPrintingId) return CUSTOM_ART;
  return line.setName || line.setCode.toUpperCase() || "Unknown set";
}

/** The commander always sits in its own group first. Everything else groups the chosen way. */
export function groupLines(lines: DeckCardLine[], mode: GroupMode, sort: SortMode = "name", direction: SortDirection = "asc"): LineGroup[] {
  const compare = comparator(sort, direction);
  const groups: LineGroup[] = [];
  const commander = lines.filter((line) => line.board === "commander");
  const rest = lines.filter((line) => line.board !== "commander");
  if (commander.length) groups.push({ title: "Commander", lines: commander.sort(compare) });

  switch (mode) {
    case "type":
      groups.push(...typeGroups(rest, compare));
      break;
    case "role": {
      // What a card does in the deck. Lands have no role of their own, and a card nobody has classified says so
      // instead of being guessed at. Both sit last.
      const counts: Record<string, number> = {};
      rest.forEach((line) => line.role && line.primaryType !== "Land" && (counts[line.role] = (counts[line.role] ?? 0) + line.quantity));
      const shown = roleFolder(counts);
      const roleOf = (line: DeckCardLine) => (line.primaryType === "Land" ? "Lands" : shown(line.role ?? UNCATEGORIZED));
      const byRole = bucket(rest, (line) => [roleOf(line)], ROLE_ORDER, compare);
      const tail = [OTHER, "Lands", UNCATEGORIZED];
      groups.push(...byRole.filter((group) => !tail.includes(group.title)), ...tail.flatMap((title) => byRole.filter((group) => group.title === title)));
      break;
    }
    case "subtype": {
      const groupsBySubtype = bucket(rest, (line) => (subtypes(line.typeLine).length ? subtypes(line.typeLine) : [NO_SUBTYPE]), [], compare);
      groups.push(...groupsBySubtype.filter((group) => group.title !== NO_SUBTYPE), ...groupsBySubtype.filter((group) => group.title === NO_SUBTYPE));
      break;
    }
    case "typeTags": {
      // A tag is a group the player made on purpose, so tagged cards sit in their tag's group and
      // the rest fall back to their type.
      const tagged = rest.filter((line) => line.tags.length > 0);
      const untagged = rest.filter((line) => line.tags.length === 0);
      groups.push(...bucket(tagged, (line) => line.tags, [], compare), ...typeGroups(untagged, compare));
      break;
    }
    case "mv":
      for (let value = 0; value <= 6; value++) {
        const matching = rest.filter((line) => Math.min(Math.floor(line.manaValue), 6) === value).sort(compare);
        if (matching.length) {
          groups.push({ title: value === 6 ? "Mana value 6 and up" : `Mana value ${value}`, lines: matching });
        }
      }
      break;
    case "color":
      groups.push(...bucket(rest, (line) => [colorGroup(line)], COLOR_ORDER, compare));
      break;
    case "identity": {
      const keys = [...new Set(rest.map(identityKey))].sort(identityOrder);
      groups.push(...bucket(rest, (line) => [identityTitle(identityKey(line))], keys.map(identityTitle), compare));
      break;
    }
    case "rarity":
      groups.push(...bucket(rest, (line) => [capitalize(line.rarity)], RARITY_ORDER.map(capitalize), compare));
      break;
    case "set": {
      const bySet = bucket(rest, (line) => [setTitle(line)], [], compare);
      groups.push(...bySet.filter((group) => group.title !== CUSTOM_ART), ...bySet.filter((group) => group.title === CUSTOM_ART));
      break;
    }
    case "tag": {
      // A card with several tags shows up under each of them. Untagged cards come last.
      const tagged = bucket(rest, (line) => (line.tags.length ? line.tags : [UNTAGGED]), [], compare);
      const untagged = tagged.filter((group) => group.title === UNTAGGED);
      groups.push(...tagged.filter((group) => group.title !== UNTAGGED), ...untagged);
      break;
    }
  }
  return groups;
}

export const lineKey = (line: Pick<DeckCardLine, "cardId" | "board">) => `${line.cardId}|${line.board}`;

/** Every tag used in the deck, alphabetical, for suggestions. */
export function allTags(lines: DeckCardLine[]): string[] {
  const seen = new Map<string, string>();
  for (const line of lines) {
    for (const tag of line.tags) seen.set(tag.toLowerCase(), seen.get(tag.toLowerCase()) ?? tag);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
