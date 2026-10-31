/** Made-up decks for the schematic lab. Counts per role, a target per role, and a mana curve. */

export type Role = "lands" | "ramp" | "draw" | "removal" | "wipes" | "protection" | "wincons";

export const ROLES: Array<{ key: Role; label: string; target: number }> = [
  { key: "lands", label: "LANDS", target: 36 },
  { key: "ramp", label: "RAMP", target: 10 },
  { key: "draw", label: "DRAW", target: 10 },
  { key: "removal", label: "REMOVAL", target: 8 },
  { key: "wipes", label: "WIPES", target: 3 },
  { key: "protection", label: "PROTECT", target: 5 },
  { key: "wincons", label: "WINCON", target: 3 },
];

export interface MockDeck {
  name: string;
  commander: string;
  bracket: number;
  counts: Record<Role, number>;
  /** Non-land cards by mana value 0, 1, 2 ... 7+. */
  curve: number[];
}

export const DECKS: MockDeck[] = [
  {
    name: "Nearly there",
    commander: "Raphael, Fiendish Savior",
    bracket: 3,
    counts: { lands: 36, ramp: 11, draw: 7, removal: 9, wipes: 1, protection: 5, wincons: 4 },
    curve: [2, 12, 16, 14, 9, 5, 3, 2],
  },
  {
    name: "Greedy",
    commander: "The Ur-Dragon",
    bracket: 4,
    counts: { lands: 33, ramp: 6, draw: 7, removal: 4, wipes: 1, protection: 2, wincons: 6 },
    curve: [0, 5, 8, 12, 14, 13, 8, 6],
  },
  {
    name: "Half built",
    commander: "Atraxa, Praetors' Voice",
    bracket: 2,
    counts: { lands: 20, ramp: 4, draw: 9, removal: 2, wipes: 0, protection: 1, wincons: 2 },
    curve: [1, 4, 7, 6, 4, 3, 1, 0],
  },
];
