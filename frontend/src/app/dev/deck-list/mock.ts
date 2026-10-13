/** Made-up cards for the list lab. Nothing here comes from the real app. */

export const ROLE_HUES: Record<string, number> = {
  Ramp: 150, "Card Draw": 235, Removal: 25, Protection: 85, "Board Wipe": 50, Tutor: 305, Recursion: 180, "Win Condition": 100, Land: 250,
};

export interface MockCard {
  name: string;
  qty: number;
  cost: string;
  cmc: number;
  price: number;
  role: string;
  also: string[];
  isNew?: boolean;
  need?: boolean;
}

export interface MockGroup {
  title: string;
  cards: MockCard[];
}

const c = (name: string, cost: string, cmc: number, price: number, role: string, also: string[] = [], extra: Partial<MockCard> = {}): MockCard => ({ name, qty: 1, cost, cmc, price, role, also, ...extra });

export const GROUPS: MockGroup[] = [
  { title: "Commander", cards: [c("Kaalia of the Vast", "{1}{R}{W}{B}", 4, 6.4, "Win Condition")] },
  {
    title: "Creatures",
    cards: [
      c("Ancient Copper Dragon", "{4}{R}{R}", 6, 1.2, "Ramp", ["Card Draw"]),
      c("Angel of Despair", "{3}{W}{W}{B}{B}", 7, 2.1, "Removal"),
      c("Aurelia, the Warleader", "{2}{R}{R}{W}{W}", 6, 3.4, "Win Condition", [], { isNew: true }),
      c("Avacyn, Angel of Hope", "{5}{W}{W}{W}", 8, 14.5, "Protection", ["Win Condition"]),
      c("Balefire Dragon", "{5}{R}{R}", 7, 2.4, "Board Wipe", ["Win Condition"]),
      c("Drana and Linvala", "{3}{W}{B}", 5, 1.9, "Removal"),
      c("Esper Sentinel", "{W}", 1, 4.7, "Card Draw", [], { need: true }),
      c("Giver of Runes", "{W}", 1, 1.1, "Protection"),
      c("Hellkite Tyrant", "{4}{R}{R}", 6, 0.9, "Ramp", ["Win Condition"]),
      c("Mother of Runes", "{W}", 1, 18.8, "Protection"),
      c("Sheoldred, the Apocalypse", "{2}{B}{B}", 4, 62.0, "Removal", ["Recursion", "Win Condition"]),
      c("Vaelendris, the Hollow Oath", "{3}{B}{B}", 5, 0.5, "Recursion"),
    ],
  },
  {
    title: "Instants",
    cards: [
      c("Anguished Unmaking", "{1}{W}{B}", 3, 1.6, "Removal"),
      c("Dark Ritual", "{B}", 1, 1.0, "Ramp"),
      c("Deflecting Swat", "{2}{R}", 3, 12.0, "Protection"),
      c("Path to Exile", "{W}", 1, 3.2, "Removal"),
      c("Swords to Plowshares", "{W}", 1, 2.6, "Removal"),
      c("Teferi's Protection", "{2}{W}", 3, 31.0, "Protection"),
    ],
  },
  {
    title: "Sorceries",
    cards: [
      c("Damn", "{B}{B}", 2, 6.9, "Board Wipe"),
      c("Demonic Tutor", "{1}{B}", 2, 31.5, "Tutor"),
      c("Reanimate", "{B}", 1, 21.0, "Recursion", ["Tutor"]),
      c("Ruinous Ultimatum", "{R}{R}{W}{W}{W}{B}{B}", 7, 1.3, "Board Wipe"),
    ],
  },
  {
    title: "Artifacts",
    cards: [
      c("Arcane Signet", "{2}", 2, 1.8, "Ramp"),
      c("Mox Opal", "{0}", 0, 98.0, "Ramp"),
      c("Sol Ring", "{1}", 1, 2.3, "Ramp", [], { qty: 1 }),
      c("Swiftfoot Boots", "{2}", 2, 1.7, "Protection"),
      c("Skullclamp", "{1}", 1, 1.9, "Card Draw"),
    ],
  },
  {
    title: "Lands",
    cards: [
      c("Command Tower", "", 0, 1.2, "Land"),
      c("Godless Shrine", "", 0, 11.0, "Land"),
      c("Isolated Chapel", "", 0, 1.4, "Land"),
      { name: "Plains", qty: 4, cost: "", cmc: 0, price: 0.1, role: "Land", also: [] },
      { name: "Swamp", qty: 3, cost: "", cmc: 0, price: 0.1, role: "Land", also: [] },
      { name: "Mountain", qty: 3, cost: "", cmc: 0, price: 0.1, role: "Land", also: [] },
    ],
  },
];
