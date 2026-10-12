/** Made-up deck data for the concept page. Nothing here comes from the real app. */

export const ROLES = [
  { name: "Lands", count: 36, hue: 250, plain: true },
  { name: "Ramp", count: 11, hue: 150 },
  { name: "Card Draw", count: 9, hue: 235 },
  { name: "Removal", count: 8, hue: 25 },
  { name: "Protection", count: 4, hue: 85 },
  { name: "Board Wipe", count: 3, hue: 50 },
  { name: "Tutor", count: 3, hue: 305 },
  { name: "Recursion", count: 3, hue: 180 },
  { name: "Win Condition", count: 2, hue: 100 },
  { name: "Uncategorized", count: 20, hue: 250, plain: true },
] as const;

export type Role = (typeof ROLES)[number]["name"];

export const CARD_NAMES = [
  "Sol Ring", "Arcane Signet", "Command Tower", "Swords to Plowshares", "Lightning Bolt", "Demonic Tutor", "Rhystic Study",
  "Smothering Tithe", "Mana Crypt", "Blood Artist", "Falkenrath Noble", "Anguished Unmaking", "Vampiric Tutor", "Reanimate",
  "Cultivate", "Kodama's Reach", "Farseek", "Nature's Lore", "Three Visits", "Skyshroud Claim", "Mother of Runes", "Giver of Runes",
  "Teferi's Protection", "Heroic Intervention", "Toxic Deluge", "Damn", "Wrath of God", "Supreme Verdict", "Dockside Extortionist",
  "Esper Sentinel", "Night's Whisper", "Phyrexian Arena", "Sign in Blood", "Read the Bones", "Skullclamp", "Mystic Remora",
  "Lightning Greaves", "Swiftfoot Boots", "Aurelia, the Warleader", "Avacyn, Angel of Hope", "Angel of Despair", "Archangel Avacyn",
  "Hellkite Tyrant", "Utvara Hellkite", "Scourge of the Throne", "Sheoldred, the Apocalypse", "Grand Abolisher", "Opposition Agent",
  "Dark Ritual", "Reanimate", "Animate Dead", "Phyrexian Reclamation", "Eternal Witness", "Ancient Copper Dragon", "Balefire Dragon",
  "Dragon Tempest", "Goblin Bombardment", "Impact Tremors", "Purphoros, God of the Forge", "Kaalia of the Vast",
];

/** Commanders to try in the atmosphere demo, with their color identity. */
export const COMMANDERS = [
  { name: "Edgar Markov", id: "WBR" },
  { name: "Krenko, Mob Boss", id: "R" },
  { name: "Atraxa, Praetors' Voice", id: "WUBG" },
  { name: "Muldrotha, the Gravetide", id: "UBG" },
  { name: "Kenrith, the Returned King", id: "WUBRG" },
  { name: "Karn, Legacy Reforged", id: "" },
] as const;

export const MANA: Record<string, { name: string; color: string }> = {
  W: { name: "White", color: "oklch(0.93 0.05 95)" },
  U: { name: "Blue", color: "oklch(0.72 0.14 245)" },
  B: { name: "Black", color: "oklch(0.55 0.1 305)" },
  R: { name: "Red", color: "oklch(0.7 0.2 28)" },
  G: { name: "Green", color: "oklch(0.72 0.17 150)" },
};

export function nameFor(identity: string): string {
  const key = identity.split("").sort().join("");
  const names: Record<string, string> = {
    "": "Colorless", W: "Mono white", U: "Mono blue", B: "Mono black", R: "Mono red", G: "Mono green",
    BRW: "Mardu", BGU: "Sultai", BGUW: "Atraxa colors", BGRUW: "Five colors", GRUW: "Four colors",
  };
  return names[key] ?? `${identity.length} colors`;
}
