import type { DeckCardLine } from "./types";

const MANA_HUE: Record<string, number> = { W: 95, U: 245, B: 305, R: 28, G: 150 };

const ROLE_HUE: Record<string, number> = {
  Ramp: 150,
  "Card Draw": 235,
  Removal: 25,
  Protection: 85,
  "Board Wipe": 50,
  Tutor: 305,
  Recursion: 180,
  "Win Condition": 100,
};

const color = (hue: number) => `oklch(var(--sel-l) var(--sel-c) ${hue})`;

/** The colors of a card's own mana cost, as css colors. Empty for colorless cards. */
export function cardColors(line: Pick<DeckCardLine, "colors">): string[] {
  const letters = [...new Set(line.colors.match(/[WUBRG]/g) ?? [])];
  return letters.map((letter) => color(MANA_HUE[letter]));
}

/**
 * The color a card is marked with when selected: its first color, or the color of its role when it has none, or a neutral grey.
 * It reads --sel-l and --sel-c, which the theme sets so the color is readable on dark and light.
 */
export function selectionColor(line: Pick<DeckCardLine, "colors" | "role">): string {
  const own = cardColors(line)[0];
  if (own) return own;
  const hue = line.role ? ROLE_HUE[line.role] : undefined;
  return hue === undefined ? "var(--muted)" : color(hue);
}
