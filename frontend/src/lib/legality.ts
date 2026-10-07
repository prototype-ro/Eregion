import type { DeckCardLine } from "./types";

/** The Commander rules the builder can check from card data. Banned lists are not checked. */
export const DECK_SIZE = 100;

export interface Legality {
  legal: boolean;
  issues: string[];
}

const COUNTED = new Set(["commander", "main"]);

const isBasic = (line: DeckCardLine) => line.typeLine.includes("Basic");
const allowsAnyNumber = (line: DeckCardLine) => /a deck can have any number of cards named/i.test(line.oracleText);
const canLead = (line: DeckCardLine) =>
  (line.typeLine.includes("Legendary") && line.typeLine.includes("Creature")) ||
  /can be your commander/i.test(line.oracleText) ||
  line.typeLine.includes("Background");
/** Two commanders are only allowed when both are meant to pair up. */
const canPair = (line: DeckCardLine) => /partner|friends forever|choose a background|doctor's companion/i.test(line.oracleText) || line.typeLine.includes("Background");

function list(names: string[], max = 4): string {
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown} and ${names.length - max} more` : shown;
}

export function checkLegality(lines: DeckCardLine[]): Legality {
  const issues: string[] = [];
  const counted = lines.filter((line) => COUNTED.has(line.board));
  const commanders = counted.filter((line) => line.board === "commander");

  const total = counted.reduce((sum, line) => sum + line.quantity, 0);
  if (total !== DECK_SIZE) {
    const gap = Math.abs(DECK_SIZE - total);
    issues.push(`${gap} ${gap === 1 ? "card" : "cards"} ${total < DECK_SIZE ? "short of" : "over"} ${DECK_SIZE}.`);
  }

  const commanderCount = commanders.reduce((sum, line) => sum + line.quantity, 0);
  if (commanderCount === 0) {
    issues.push("No commander chosen.");
  } else if (commanderCount > 2 || (commanderCount === 2 && !commanders.every(canPair))) {
    issues.push("Only one commander is allowed, unless both have partner or a background.");
  }
  const notLeaders = commanders.filter((line) => !canLead(line)).map((line) => line.name);
  if (notLeaders.length > 0) issues.push(`${list(notLeaders)} cannot be a commander.`);

  const copies = new Map<string, { line: DeckCardLine; count: number }>();
  for (const line of counted) {
    const seen = copies.get(line.cardId);
    copies.set(line.cardId, { line, count: (seen?.count ?? 0) + line.quantity });
  }
  const repeated = [...copies.values()].filter(({ line, count }) => count > 1 && !isBasic(line) && !allowsAnyNumber(line));
  if (repeated.length > 0) issues.push(`Only one copy of each card is allowed: ${list(repeated.map(({ line, count }) => `${line.name} (${count})`))}.`);

  if (commanders.length > 0) {
    const identity = new Set(commanders.flatMap((line) => line.colorIdentity.split("")));
    const outside = counted
      .filter((line) => line.board !== "commander" && line.colorIdentity.split("").some((color) => !identity.has(color)))
      .map((line) => line.name);
    if (outside.length > 0) issues.push(`Outside the commander's colors: ${list(outside)}.`);
  }

  return { legal: issues.length === 0, issues };
}
