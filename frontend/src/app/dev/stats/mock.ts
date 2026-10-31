/**
 * Made-up analysis numbers for the stats lab, shaped like the real DTOs (Composition, Consistency,
 * Speed) so the diagrams could be pointed at the real endpoint later. Nothing here is real.
 */

/** The mana colours, the same oklch values the atmosphere uses. This is the one place in the app colours are allowed. */
export const MANA_COLORS: Record<string, string> = {
  W: "oklch(0.93 0.05 95)",
  U: "oklch(0.72 0.14 245)",
  B: "oklch(0.55 0.1 305)",
  R: "oklch(0.7 0.2 28)",
  G: "oklch(0.72 0.17 150)",
  C: "oklch(0.78 0.02 250)",
};

export const COLOR_ORDER = ["W", "U", "B", "R", "G"];

export interface Composition {
  medianManaValue: number;
  pips: Record<string, number>;
  sources: Record<string, number>;
}

/** Kaalia, RWB: pips and sources are per colour, exactly as AnalysisDtos.Composition sends them. */
export const COMPOSITION: Composition = {
  medianManaValue: 3,
  pips: { W: 15, U: 0, B: 22, R: 19, G: 0 },
  sources: { W: 18, U: 0, B: 22, R: 20, G: 0, C: 7 },
};

export interface Chance {
  label: string;
  value: number;
  hint?: string;
}

export const CHANCES: Chance[] = [
  { label: "Keepable opening hand", value: 0.82, hint: "2 to 5 lands in 7" },
  { label: "Land drop on turn 3", value: 0.81 },
  { label: "Land drop on turn 4", value: 0.72 },
  { label: "Cheap ramp by turn 2", value: 0.45, hint: "9 ramp cards of MV 2 or less" },
  { label: "Two ramp by turn 3", value: 0.28 },
  { label: "Commander on curve", value: 0.66, hint: "lands and cheap ramp by MV 4" },
  { label: "A white source by turn 3", value: 0.91 },
  { label: "A black source by turn 3", value: 0.94 },
];

/** Chance of having each thing by turn t, monotone. Rows are the metrics, columns are turns 1 to 5. */
export const ALMANAC = {
  turns: [1, 2, 3, 4, 5],
  rows: [
    { label: "Land drop", values: [0.9, 0.97, 0.99, 1, 1] },
    { label: "Cheap ramp", values: [0.08, 0.45, 0.62, 0.74, 0.82] },
    { label: "White source", values: [0.55, 0.78, 0.91, 0.95, 0.97] },
    { label: "Black source", values: [0.58, 0.82, 0.94, 0.97, 0.98] },
    { label: "Red source", values: [0.56, 0.8, 0.92, 0.96, 0.98] },
  ],
};

export interface Speed {
  games: number;
  manaByTurn: number[];
  commanderTurn: number;
  commanderByTurn: Record<string, number>;
  comboTurn: number;
  comboByTurn: Record<string, number>;
}

export const SPEED: Speed = {
  games: 800,
  manaByTurn: [1.0, 2.1, 3.0, 4.4, 5.1, 5.6, 6.0, 6.2],
  commanderTurn: 4.6,
  commanderByTurn: { "3": 0.18, "4": 0.52, "5": 0.71, "6": 0.83 },
  comboTurn: 7.2,
  comboByTurn: { "4": 0.05, "6": 0.28, "8": 0.54, "10": 0.72 },
};

/** Land-drop chance per turn 1 to 10, for the route's columns. Past turn 5 it is effectively certain. */
export const LAND_BY_TURN = [0.9, 0.97, 0.99, 1, 1, 1, 1, 1, 1, 1];
