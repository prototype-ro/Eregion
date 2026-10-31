/**
 * Made-up data for the viz lab, reusing the time-scrub deck history so the pieces that run over
 * versions have a real timeline behind them. Nothing here is real.
 */

import { buildHistory, ROLE_HUES, type ScrubCard } from "../time-scrub/mock";

export { ROLE_HUES };

export const HISTORY = buildHistory();
export const CARDS: ScrubCard[] = HISTORY.union;
export const VERSIONS = HISTORY.versions;
export const MAXV = VERSIONS.length;

/** The mana colours, from the stats lab mock. The one semantic palette the app allows. */
export { MANA_COLORS } from "../stats/mock";
import { MANA_COLORS as MANA } from "../stats/mock";

export const COLOR_ORDER = ["W", "U", "B", "R", "G"];

export function presenceOf(name: string): boolean[] {
  return HISTORY.presence.get(name) ?? [];
}

/** The first coloured symbol in a cost, for tinting a card's dot. Colorless and lands fall back to C. */
export function primaryColor(cost: string): string {
  return COLOR_ORDER.find((color) => cost.includes(`{${color}}`)) ?? "C";
}

export function manaColor(color: string): string {
  return MANA[color] ?? MANA.C;
}

export interface VizCombo {
  cards: string[];
  missing: string[];
  produces: string[];
}

/** A few made-up combos over cards that really are in the mocked deck. */
export const COMBOS: VizCombo[] = [
  { cards: ["Demonic Tutor", "Animate Dead", "Kozilek, Butcher of Truth"], missing: [], produces: ["Tutor into the reanimation"] },
  { cards: ["Rune-Scarred Demon", "Animate Dead", "Kozilek, Butcher of Truth"], missing: [], produces: ["Tutor the titan back"] },
  { cards: ["Animate Dead", "Kozilek, Butcher of Truth"], missing: ["Buried Alive"], produces: ["A titan on turn five"] },
  { cards: ["Angel of Despair", "Reanimate"], missing: ["Entomb"], produces: ["An angel on turn two"] },
  { cards: ["Rakdos, the Defiler", "Reanimate"], missing: [], produces: ["A very large demon"] },
];

/** The hero numbers the halftone sigil can show. */
export const SIGIL = {
  figure: "4",
  label: "Commander bracket",
  score: 68,
  scoreLabel: "Deck health",
  colors: 3,
  colorsLabel: "Colours",
};

/** Roles in the order streams and ranks are stacked. */
export const ROLE_ORDER = ["Ramp", "Card Draw", "Removal", "Board Wipe", "Tutor", "Recursion", "Protection", "Win Condition"];

export interface Aggregate {
  curve: number[];
  roles: Record<string, number>;
  types: Record<string, number>;
  total: number;
  price: number;
}

/** Per-version curve (bins 0 to 7, lands out), role counts and type counts. */
export function aggregate(): Aggregate[] {
  return VERSIONS.map((version) => {
    const curve = new Array<number>(8).fill(0);
    const roles: Record<string, number> = {};
    const types: Record<string, number> = {};
    let total = 0;
    let price = 0;
    for (const name of version.present) {
      const card = CARDS.find((entry) => entry.name === name);
      if (!card) continue;
      total += 1;
      price += card.price;
      types[card.type] = (types[card.type] ?? 0) + 1;
      if (card.type === "Land") continue;
      curve[Math.min(card.cmc, 7)] += 1;
      roles[card.role] = (roles[card.role] ?? 0) + 1;
    }
    return { curve, roles, types, total, price };
  });
}
