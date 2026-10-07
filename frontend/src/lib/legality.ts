import type { DeckCardLine } from "./types";

/**
 * The Commander rules the builder can check from card data: 100 cards, a commander or a valid pair, copies
 * allowed, everything inside the commander's colors, and no card that is banned or not legal in Commander.
 *
 * DeckLegality in the API applies the same rules to the saved decks on the decks page. Both are tested against
 * shared/legality-cases.json, so the wording and the results cannot drift apart.
 */
export const DECK_SIZE = 100;

export interface Legality {
  legal: boolean;
  issues: string[];
}

const COUNTED = new Set(["commander", "main"]);
const UNLIMITED = Number.MAX_SAFE_INTEGER;
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

const ANY_NUMBER = /a deck can have any number of cards named/i;
const UP_TO = /a deck can have up to (\w+) cards named/i;
const CAN_BE_COMMANDER = /can be your commander/i;
const PARTNER_WITH = /partner with ([^\n(]+)/i;
const PARTNER_VARIANT = /^partner\s*[\u2014\u2013-]\s*([^\n(]+)/im;
const PLAIN_PARTNER = /^partner\b(?!\s+with)(?!\s*[\u2014\u2013-])/im;
const FRIENDS = /friends forever/i;
const CHOOSE_BACKGROUND = /choose a background/i;
const DOCTORS_COMPANION = /doctor's companion/i;

/** How many copies of a card a deck may hold: one, unless it is a basic land or its text says otherwise. */
export function copyLimit(line: DeckCardLine): number {
  if (line.typeLine.includes("Basic") || ANY_NUMBER.test(line.oracleText)) return UNLIMITED;
  const upTo = UP_TO.exec(line.oracleText);
  if (upTo) {
    const number = NUMBER_WORDS.indexOf(upTo[1].toLowerCase());
    return number > 0 ? number : 1;
  }
  return 1;
}

export const canLead = (line: DeckCardLine) =>
  (line.typeLine.includes("Legendary") && line.typeLine.includes("Creature")) ||
  CAN_BE_COMMANDER.test(line.oracleText) ||
  line.typeLine.includes("Background");

function sameName(wanted: string, name: string): boolean {
  const front = name.split(" // ")[0];
  const w = wanted.trim().toLowerCase();
  return w === name.trim().toLowerCase() || w === front.trim().toLowerCase();
}

/** Whether two commanders may lead one deck: partners, partners with each other, friends forever, a background, or a Doctor. */
export function pairs(a: DeckCardLine, b: DeckCardLine): boolean {
  const withA = PARTNER_WITH.exec(a.oracleText)?.[1].trim() ?? null;
  const withB = PARTNER_WITH.exec(b.oracleText)?.[1].trim() ?? null;
  if (withA !== null || withB !== null) {
    return (withA === null || sameName(withA, b.name)) && (withB === null || sameName(withB, a.name));
  }
  const variantA = PARTNER_VARIANT.exec(a.oracleText)?.[1].trim().toLowerCase() ?? null;
  const variantB = PARTNER_VARIANT.exec(b.oracleText)?.[1].trim().toLowerCase() ?? null;
  if (variantA !== null || variantB !== null) return variantA !== null && variantA === variantB;
  if (PLAIN_PARTNER.test(a.oracleText) && PLAIN_PARTNER.test(b.oracleText)) return true;
  if (FRIENDS.test(a.oracleText) && FRIENDS.test(b.oracleText)) return true;
  if ((CHOOSE_BACKGROUND.test(a.oracleText) && b.typeLine.includes("Background")) || (CHOOSE_BACKGROUND.test(b.oracleText) && a.typeLine.includes("Background"))) return true;
  return (DOCTORS_COMPANION.test(a.oracleText) && b.typeLine.includes("Doctor")) || (DOCTORS_COMPANION.test(b.oracleText) && a.typeLine.includes("Doctor"));
}

/** Names without repeats, in alphabetical order, so the same deck always gives the same words. */
const names = (lines: DeckCardLine[]) => [...new Set(lines.map((line) => line.name))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

function list(items: string[], max = 4): string {
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown} and ${items.length - max} more` : shown;
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
  } else if (commanderCount > 2 || commanders.length > 2) {
    issues.push("A deck has at most two commanders, and only as a valid pair.");
  } else if (commanderCount === 2 && commanders.length === 2 && !pairs(commanders[0], commanders[1])) {
    issues.push(`${commanders[0].name} and ${commanders[1].name} cannot be commanders together. Pairs need partner, friends forever, a background or a Doctor and its companion.`);
  }
  const notLeaders = names(commanders.filter((line) => !canLead(line)));
  if (notLeaders.length > 0) issues.push(`${list(notLeaders)} cannot be a commander.`);

  const copies = new Map<string, { line: DeckCardLine; count: number }>();
  for (const line of counted) {
    const seen = copies.get(line.cardId);
    copies.set(line.cardId, { line: seen?.line ?? line, count: (seen?.count ?? 0) + line.quantity });
  }
  const single: string[] = [];
  const limited: string[] = [];
  for (const { line, count } of copies.values()) {
    const max = copyLimit(line);
    if (count <= max) continue;
    if (max === 1) single.push(`${line.name} (${count})`);
    else limited.push(`${line.name} (${count}, at most ${max})`);
  }
  single.sort();
  limited.sort();
  if (single.length > 0) issues.push(`Only one copy of each card is allowed: ${list(single)}.`);
  if (limited.length > 0) issues.push(`More copies than allowed: ${list(limited)}.`);

  if (commanders.length > 0) {
    const identity = new Set(commanders.flatMap((line) => line.colorIdentity.split("")));
    const outside = names(counted.filter((line) => line.board !== "commander" && line.colorIdentity.split("").some((color) => !identity.has(color))));
    if (outside.length > 0) issues.push(`Outside the commander's colors: ${list(outside)}.`);
  }

  const banned = names(counted.filter((line) => line.commanderLegality === "banned"));
  if (banned.length > 0) issues.push(`Banned in Commander: ${list(banned)}.`);
  const notLegal = names(counted.filter((line) => line.commanderLegality === "not_legal"));
  if (notLegal.length > 0) issues.push(`Not legal in Commander: ${list(notLegal)}.`);

  return { legal: issues.length === 0, issues };
}
