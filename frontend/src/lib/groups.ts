import type { DeckCardLine } from "./types";

export type GroupMode = "type" | "mv";

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

const byName = (a: DeckCardLine, b: DeckCardLine) => a.name.localeCompare(b.name);

/** The commander always sits in its own group first. Everything else groups by type or mana value. */
export function groupLines(lines: DeckCardLine[], mode: GroupMode): LineGroup[] {
  const groups: LineGroup[] = [];
  const commander = lines.filter((line) => line.board === "commander");
  const rest = lines.filter((line) => line.board !== "commander");

  if (commander.length) groups.push({ title: "Commander", lines: commander });

  if (mode === "type") {
    for (const [type, title] of TYPE_GROUPS) {
      const matching = rest.filter((line) => line.primaryType === type).sort(byName);
      if (matching.length) groups.push({ title, lines: matching });
    }
  } else {
    for (let value = 0; value <= 6; value++) {
      const matching = rest
        .filter((line) => Math.min(Math.floor(line.manaValue), 6) === value)
        .sort(byName);
      if (matching.length) {
        groups.push({ title: value === 6 ? "Mana value 6 and up" : `Mana value ${value}`, lines: matching });
      }
    }
  }
  return groups;
}

/** Splits groups into two columns of roughly equal height. */
export function splitColumns(groups: LineGroup[]): [LineGroup[], LineGroup[]] {
  const left: LineGroup[] = [];
  const right: LineGroup[] = [];
  let leftWeight = 0;
  let rightWeight = 0;
  for (const group of groups) {
    const weight = group.lines.length + 2;
    if (leftWeight <= rightWeight) {
      left.push(group);
      leftWeight += weight;
    } else {
      right.push(group);
      rightWeight += weight;
    }
  }
  return [left, right];
}

export const lineKey = (line: Pick<DeckCardLine, "cardId" | "board">) => `${line.cardId}|${line.board}`;
