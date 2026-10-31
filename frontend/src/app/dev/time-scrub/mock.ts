/**
 * Made-up deck history for the time-scrub lab. Nothing here comes from the real app.
 *
 * It is shaped like what the backend would send as a "spine": the union of every card that ever
 * existed in the deck, each with a boolean presence per version. Scrubbing is then a lookup, not a
 * diff, which is what makes dragging the playhead cheap.
 */

import { ROLE_HUES } from "../deck-list/mock";

export { ROLE_HUES };

export interface ScrubCard {
  name: string;
  cost: string;
  cmc: number;
  price: number;
  role: string;
  type: string;
}

export interface ScrubVersion {
  n: number;
  note: string;
  present: Set<string>;
}

export interface History {
  cards: Map<string, ScrubCard>;
  versions: ScrubVersion[];
  /** For each card, a boolean per version (index 0 is v1). */
  presence: Map<string, boolean[]>;
  /** Every card, in declaration order. */
  union: ScrubCard[];
}

const c = (name: string, cost: string, cmc: number, price: number, role: string, type: string): ScrubCard => ({ name, cost, cmc, price, role, type });

const ALL: ScrubCard[] = [
  c("Kaalia of the Vast", "{1}{R}{W}{B}", 4, 6.4, "Win Condition", "Commander"),
  c("Angel of Despair", "{3}{W}{W}{B}{B}", 7, 2.1, "Removal", "Creature"),
  c("Avacyn, Angel of Hope", "{5}{W}{W}{W}", 8, 14.5, "Protection", "Creature"),
  c("Aurelia, the Warleader", "{2}{R}{R}{W}{W}", 6, 3.4, "Win Condition", "Creature"),
  c("Balefire Dragon", "{5}{R}{R}", 7, 2.4, "Board Wipe", "Creature"),
  c("Gisela, Blade of Goldnight", "{4}{R}{W}{W}", 7, 6.8, "Win Condition", "Creature"),
  c("Iona, Shield of Emeria", "{6}{W}{W}{W}", 9, 8.0, "Protection", "Creature"),
  c("Rune-Scarred Demon", "{5}{B}{B}", 7, 3.1, "Tutor", "Creature"),
  c("Hellkite Tyrant", "{4}{R}{R}", 6, 0.9, "Ramp", "Creature"),
  c("Dragon Mage", "{5}{R}{R}", 7, 0.6, "Card Draw", "Creature"),
  c("Utvara Hellkite", "{6}{R}{R}", 8, 2.2, "Win Condition", "Creature"),
  c("Mother of Runes", "{W}", 1, 18.8, "Protection", "Creature"),
  c("Esper Sentinel", "{W}", 1, 4.7, "Card Draw", "Creature"),
  c("Giver of Runes", "{W}", 1, 1.1, "Protection", "Creature"),
  c("Grand Abolisher", "{W}{W}", 2, 4.2, "Protection", "Creature"),
  c("Rakdos, the Defiler", "{3}{B}{B}{R}{R}", 7, 1.5, "Win Condition", "Creature"),
  c("Kozilek, Butcher of Truth", "{10}", 10, 5.5, "Win Condition", "Creature"),
  c("Swords to Plowshares", "{W}", 1, 2.6, "Removal", "Instant"),
  c("Path to Exile", "{W}", 1, 3.2, "Removal", "Instant"),
  c("Anguished Unmaking", "{1}{W}{B}", 3, 1.6, "Removal", "Instant"),
  c("Deflecting Swat", "{2}{R}", 3, 12.0, "Protection", "Instant"),
  c("Teferi's Protection", "{2}{W}", 3, 31.0, "Protection", "Instant"),
  c("Chaos Warp", "{2}{R}", 3, 1.4, "Removal", "Instant"),
  c("Kolaghan's Command", "{1}{B}{R}", 3, 2.1, "Recursion", "Instant"),
  c("Damn", "{B}{B}", 2, 6.9, "Board Wipe", "Sorcery"),
  c("Demonic Tutor", "{1}{B}", 2, 31.5, "Tutor", "Sorcery"),
  c("Reanimate", "{B}", 1, 21.0, "Recursion", "Sorcery"),
  c("Ruinous Ultimatum", "{R}{R}{W}{W}{W}{B}{B}", 7, 1.3, "Board Wipe", "Sorcery"),
  c("Vindicate", "{1}{W}{B}", 3, 1.9, "Removal", "Sorcery"),
  c("Toxic Deluge", "{2}{B}", 3, 9.0, "Board Wipe", "Sorcery"),
  c("Animate Dead", "{1}{B}", 2, 3.0, "Recursion", "Sorcery"),
  c("Sol Ring", "{1}", 1, 2.3, "Ramp", "Artifact"),
  c("Arcane Signet", "{2}", 2, 1.8, "Ramp", "Artifact"),
  c("Mox Opal", "{0}", 0, 98.0, "Ramp", "Artifact"),
  c("Swiftfoot Boots", "{2}", 2, 1.7, "Protection", "Artifact"),
  c("Skullclamp", "{1}", 1, 1.9, "Card Draw", "Artifact"),
  c("Phyrexian Arena", "{1}{B}{B}", 3, 3.5, "Card Draw", "Enchantment"),
  c("Black Market Connections", "{2}{B}", 3, 6.0, "Ramp", "Enchantment"),
  c("Smothering Tithe", "{3}{W}", 4, 22.0, "Ramp", "Enchantment"),
  c("Land Tax", "{W}", 1, 40.0, "Card Draw", "Enchantment"),
  c("Command Tower", "", 0, 1.2, "Land", "Land"),
  c("Godless Shrine", "", 0, 11.0, "Land", "Land"),
  c("Isolated Chapel", "", 0, 1.4, "Land", "Land"),
  c("Blood Crypt", "", 0, 12.0, "Land", "Land"),
  c("Sacred Foundry", "", 0, 12.5, "Land", "Land"),
  c("Plateau", "", 0, 250.0, "Land", "Land"),
  c("Dragonskull Summit", "", 0, 1.2, "Land", "Land"),
  c("Clifftop Retreat", "", 0, 1.4, "Land", "Land"),
];

/** The first build, before any of the steps below. */
const BASE = [
  "Kaalia of the Vast",
  "Angel of Despair",
  "Avacyn, Angel of Hope",
  "Aurelia, the Warleader",
  "Gisela, Blade of Goldnight",
  "Iona, Shield of Emeria",
  "Rune-Scarred Demon",
  "Hellkite Tyrant",
  "Dragon Mage",
  "Utvara Hellkite",
  "Mother of Runes",
  "Swords to Plowshares",
  "Path to Exile",
  "Anguished Unmaking",
  "Chaos Warp",
  "Damn",
  "Demonic Tutor",
  "Reanimate",
  "Ruinous Ultimatum",
  "Vindicate",
  "Sol Ring",
  "Arcane Signet",
  "Swiftfoot Boots",
  "Skullclamp",
  "Phyrexian Arena",
  "Black Market Connections",
  "Command Tower",
  "Godless Shrine",
  "Isolated Chapel",
  "Blood Crypt",
  "Sacred Foundry",
  "Plateau",
  "Dragonskull Summit",
  "Clifftop Retreat",
];

/** One step per saved version after the first. The notes are the kind the chronicle would suggest. */
const STEPS: Array<{ note: string; add?: string[]; remove?: string[] }> = [
  { note: "Cheap protection", add: ["Esper Sentinel", "Giver of Runes"] },
  { note: "More ramp, less filler", add: ["Smothering Tithe"], remove: ["Dragon Mage"] },
  { note: "Fast mana in", add: ["Mox Opal"], remove: ["Skullclamp"] },
  { note: "Protect the board", add: ["Teferi's Protection"], remove: ["Chaos Warp"] },
  { note: "Bigger dragons", add: ["Balefire Dragon"], remove: ["Utvara Hellkite"] },
  { note: "Free interaction", add: ["Deflecting Swat"], remove: ["Vindicate"] },
  { note: "Cut the banned angel", add: ["Grand Abolisher"], remove: ["Iona, Shield of Emeria"] },
  { note: "Sell the fast mana", add: ["Land Tax"], remove: ["Mox Opal"] },
  { note: "Command in", add: ["Kolaghan's Command"], remove: ["Phyrexian Arena"] },
  { note: "Trade the sentinel", add: ["Rakdos, the Defiler"], remove: ["Esper Sentinel"] },
  { note: "More wipes", add: ["Toxic Deluge"], remove: ["Grand Abolisher"] },
  { note: "Swat comes back", add: ["Chaos Warp"], remove: ["Kolaghan's Command"] },
  { note: "Reanimation plan", add: ["Animate Dead"], remove: ["Reanimate"] },
  { note: "Top end", add: ["Kozilek, Butcher of Truth"], remove: ["Gisela, Blade of Goldnight"] },
];

export function buildHistory(): History {
  const present = new Set(BASE);
  const versions: ScrubVersion[] = [{ n: 1, note: "First build", present: new Set(present) }];
  STEPS.forEach((step, index) => {
    step.remove?.forEach((name) => present.delete(name));
    step.add?.forEach((name) => present.add(name));
    versions.push({ n: index + 2, note: step.note, present: new Set(present) });
  });
  const presence = new Map<string, boolean[]>();
  for (const card of ALL) presence.set(card.name, versions.map((version) => version.present.has(card.name)));
  return { cards: new Map(ALL.map((card) => [card.name, card])), versions, presence, union: ALL };
}
