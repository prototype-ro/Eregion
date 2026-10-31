/** Made-up deck data for the dot concepts page. Nothing here comes from the real app. */

export const ROLES = [
  { name: "Lands", count: 36, hue: 250, plain: true },
  { name: "Ramp", count: 11, hue: 150 },
  { name: "Card Draw", count: 9, hue: 235 },
  { name: "Removal", count: 8, hue: 25 },
  { name: "Protection", count: 4, hue: 85 },
  { name: "Board Wipe", count: 3, hue: 50 },
  { name: "Tutor", count: 3, hue: 305 },
  { name: "Recursion", count: 3, hue: 180 },
  { name: "Win Condition", count: 3, hue: 100 },
  { name: "Uncategorized", count: 20, hue: 250, plain: true },
] as const;

export type RoleName = (typeof ROLES)[number]["name"];

export interface Card {
  id: number;
  name: string;
  role: RoleName;
  hue: number;
  plain: boolean;
  land: boolean;
  cmc: number;
}

const NAMES: Partial<Record<RoleName, string[]>> = {
  Ramp: ["Sol Ring", "Arcane Signet", "Talisman of Indulgence", "Rakdos Signet", "Fellwar Stone", "Mind Stone", "Dark Ritual", "Orzhov Signet", "Boros Signet", "Smothering Tithe", "Dockside Extortionist"],
  "Card Draw": ["Phyrexian Arena", "Night's Whisper", "Sign in Blood", "Read the Bones", "Skullclamp", "Esper Sentinel", "Black Market Connections", "Faithless Looting", "Mask of Memory"],
  Removal: ["Swords to Plowshares", "Path to Exile", "Anguished Unmaking", "Lightning Bolt", "Chaos Warp", "Infernal Grasp", "Feed the Swarm", "Vindicate"],
  Protection: ["Teferi's Protection", "Lightning Greaves", "Swiftfoot Boots", "Grand Abolisher"],
  "Board Wipe": ["Toxic Deluge", "Damn", "Blasphemous Act"],
  Tutor: ["Demonic Tutor", "Vampiric Tutor", "Enlightened Tutor"],
  Recursion: ["Reanimate", "Animate Dead", "Phyrexian Reclamation"],
  "Win Condition": ["Exquisite Blood", "Sanguine Bond", "Impact Tremors"],
  Uncategorized: ["Blood Artist", "Zulaport Cutthroat", "Falkenrath Noble", "Pitiless Plunderer", "Bastion of Remembrance", "Ashnod's Altar", "Phyrexian Altar", "Carrion Feeder", "Viscera Seer", "Goblin Bombardment", "Mayhem Devil", "Cruel Celebrant", "Vindictive Vampire", "Elas il-Kor", "Gix, Yawgmoth Praetor", "Bloodghast", "Reassembling Skeleton", "Gravecrawler", "Sheoldred, the Apocalypse", "Purphoros, God of the Forge"],
};

const CMC: Partial<Record<RoleName, number[]>> = {
  Ramp: [1, 2, 2, 2, 2, 2, 1, 2, 2, 3, 2],
  "Card Draw": [4, 2, 2, 4, 1, 1, 5, 1, 2],
  Removal: [1, 1, 4, 1, 3, 2, 2, 3],
  Protection: [3, 2, 1, 2],
  "Board Wipe": [3, 4, 8],
  Tutor: [2, 1, 1],
  Recursion: [1, 2, 3],
  "Win Condition": [4, 5, 3],
  Uncategorized: [1, 2, 3, 3, 4, 1, 2, 2, 1, 2, 4, 4, 3, 2, 4, 2, 1, 1, 4, 5],
};

export const CARDS: Card[] = (() => {
  const out: Card[] = [];
  for (const role of ROLES) {
    for (let i = 0; i < role.count; i++) {
      const land = role.name === "Lands";
      out.push({
        id: out.length,
        name: land ? `${["Swamp", "Mountain", "Plains"][i % 3]} ${Math.floor(i / 3) + 1}` : NAMES[role.name]?.[i] ?? `${role.name} ${i + 1}`,
        role: role.name,
        hue: role.hue,
        plain: "plain" in role && !!role.plain,
        land,
        cmc: land ? 0 : CMC[role.name]?.[i] ?? 3,
      });
    }
  }
  return out;
})();

const byName = (name: string) => CARDS.find((c) => c.name === name)!.id;

/** Combos (two or three cards that win or loop together) and looser synergies. */
export const LINKS: Array<{ ids: number[]; kind: "combo" | "synergy"; name: string }> = [
  { ids: [byName("Exquisite Blood"), byName("Sanguine Bond")], kind: "combo", name: "Infinite drain" },
  { ids: [byName("Gravecrawler"), byName("Phyrexian Altar"), byName("Blood Artist")], kind: "combo", name: "Altar loop" },
  { ids: [byName("Reassembling Skeleton"), byName("Ashnod's Altar"), byName("Pitiless Plunderer")], kind: "combo", name: "Skeleton loop" },
  { ids: [byName("Mayhem Devil"), byName("Goblin Bombardment")], kind: "synergy", name: "Sacrifice pings" },
  { ids: [byName("Zulaport Cutthroat"), byName("Viscera Seer")], kind: "synergy", name: "Drain on death" },
  { ids: [byName("Skullclamp"), byName("Bloodghast")], kind: "synergy", name: "Clamp value" },
  { ids: [byName("Impact Tremors"), byName("Purphoros, God of the Forge")], kind: "synergy", name: "Burn on entry" },
  { ids: [byName("Demonic Tutor"), byName("Exquisite Blood")], kind: "synergy", name: "Finds the combo" },
  { ids: [byName("Vampiric Tutor"), byName("Sanguine Bond")], kind: "synergy", name: "Finds the combo" },
];

/** Colour demand (pips on spells) against sources (lands and rocks that make that colour). */
export const COLOURS = [
  { key: "W", name: "White", pips: 18, sources: 14, tone: "oklch(0.93 0.05 95)" },
  { key: "B", name: "Black", pips: 46, sources: 24, tone: "oklch(0.7 0.06 300)" },
  { key: "R", name: "Red", pips: 31, sources: 12, tone: "oklch(0.7 0.15 32)" },
];
