import type { DeckCardLine } from "./types";

export type GroupMode = "type" | "mv" | "color" | "rarity" | "tag";

export const GROUP_MODES: Array<[GroupMode, string]> = [
  ["type", "Type"],
  ["mv", "Mana value"],
  ["color", "Color"],
  ["rarity", "Rarity"],
  ["tag", "Custom tag"],
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

const byName = (a: DeckCardLine, b: DeckCardLine) => a.name.localeCompare(b.name);

/** Which color group a card sits in. Lands keep their own group so they do not bury the colorless cards. */
export function colorGroup(line: DeckCardLine): string {
  if (line.primaryType === "Land") return "Lands";
  if (line.colors.length === 0) return "Colorless";
  if (line.colors.length > 1) return "Multicolor";
  return COLOR_NAMES[line.colors] ?? "Colorless";
}

const capitalize = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : "Unknown");

/** Collects the lines into named groups, in the order the groups should appear. */
function bucket(lines: DeckCardLine[], keys: (line: DeckCardLine) => string[], order: string[]): LineGroup[] {
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
  return [...known, ...extra].map((key) => ({ title: key, lines: (map.get(key) ?? []).sort(byName) }));
}

/** The commander always sits in its own group first. Everything else groups the chosen way. */
export function groupLines(lines: DeckCardLine[], mode: GroupMode): LineGroup[] {
  const groups: LineGroup[] = [];
  const commander = lines.filter((line) => line.board === "commander");
  const rest = lines.filter((line) => line.board !== "commander");
  if (commander.length) groups.push({ title: "Commander", lines: commander });

  switch (mode) {
    case "type":
      for (const [type, title] of TYPE_GROUPS) {
        const matching = rest.filter((line) => line.primaryType === type).sort(byName);
        if (matching.length) groups.push({ title, lines: matching });
      }
      break;
    case "mv":
      for (let value = 0; value <= 6; value++) {
        const matching = rest.filter((line) => Math.min(Math.floor(line.manaValue), 6) === value).sort(byName);
        if (matching.length) {
          groups.push({ title: value === 6 ? "Mana value 6 and up" : `Mana value ${value}`, lines: matching });
        }
      }
      break;
    case "color":
      groups.push(...bucket(rest, (line) => [colorGroup(line)], COLOR_ORDER));
      break;
    case "rarity":
      groups.push(
        ...bucket(rest, (line) => [capitalize(line.rarity)], RARITY_ORDER.map(capitalize)),
      );
      break;
    case "tag": {
      // A card with several tags shows up under each of them. Untagged cards come last.
      const tagged = bucket(rest, (line) => (line.tags.length ? line.tags : [UNTAGGED]), []);
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
