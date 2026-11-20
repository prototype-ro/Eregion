import type { DeckCardLine } from "./types";

export interface TokenNeed {
  /** "1/1 white Soldier", "Treasure", "Copy of a permanent". */
  token: string;
  /** The cards in the deck that make it. */
  makers: string[];
}

const COUNT = /^(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|x|that many|a number of|any number of|twice that many|\d+)(?:\s+|$)/i;
const DROP = new Set(["tapped", "and", "attacking", "creature", "artifact", "enchantment", "land", "additional", "legendary", "snow"]);

/** The token a "create ... token" phrase describes, or null when it names none. */
function tokenOf(phrase: string, after: string): string | null {
  let words = phrase.trim().replace(COUNT, "").split(/\s+/);
  // "a tapped 2/2 black Zombie creature" keeps the stats, the colours and the type names.
  words = words.filter((word) => word && !DROP.has(word.toLowerCase()));
  if (words.length === 0) return /^\s*that'?s a copy|^\s*that are copies|copy of/i.test(after) ? "Copy of a permanent" : null;
  if (words.length > 6 || words.some((word) => /[,:()"]/.test(word))) return null;
  // A token is named by a capitalised type (Soldier, Treasure, Food); "one or more" or "of those" names none.
  if (!words.some((word) => /^[A-Z]/.test(word))) return null;
  return words.join(" ");
}

/**
 * The tokens a deck can make, read from its cards' rules text, with the cards that make each. It only reads plain
 * "create ... token" wording, so an unusual card may be missed; it is a checklist for the table, not a rules engine.
 */
export function tokensNeeded(lines: DeckCardLine[]): TokenNeed[] {
  const byToken = new Map<string, Set<string>>();
  for (const line of lines) {
    if (line.board !== "commander" && line.board !== "main") continue;
    const text = line.oracleText ?? "";
    for (const match of text.matchAll(/\bcreates?\s+([^.;:]*?)\s+tokens?\b(.{0,24})/gi)) {
      const token = tokenOf(match[1], match[2] ?? "");
      if (!token) continue;
      const makers = byToken.get(token) ?? new Set<string>();
      makers.add(line.name);
      byToken.set(token, makers);
    }
  }
  return [...byToken.entries()]
    .map(([token, makers]) => ({ token, makers: [...makers].sort() }))
    .sort((a, b) => b.makers.length - a.makers.length || a.token.localeCompare(b.token));
}
