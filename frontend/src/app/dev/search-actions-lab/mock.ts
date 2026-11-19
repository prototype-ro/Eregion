/** Made-up search results for the search-actions lab. Nothing here comes from the real app. */

export interface MockResult {
  name: string;
  cost: string | null;
  typeLine: string;
  price: number | null;
  role: string | null;
  text: string;
  already: boolean;
  legendary: boolean;
}

export const RESULTS: MockResult[] = [
  { name: "Lightning Greaves", cost: "{0}", typeLine: "Legendary Artifact — Equipment", price: 3.2, role: "Protection", text: "Equipped creature has haste and shroud.", already: false, legendary: false },
  { name: "Kaalia of the Vast", cost: "{1}{R}{W}{B}", typeLine: "Legendary Creature — Human Cleric", price: 6.4, role: "Win Condition", text: "Flying. At the beginning of combat on your turn, you may put a creature with power 4 or greater and flying from your hand onto the battlefield.", already: true, legendary: true },
  { name: "Swords to Plowshares", cost: "{W}", typeLine: "Instant", price: 1.1, role: "Removal", text: "Exile target creature. Its controller gains life equal to its power.", already: false, legendary: false },
  { name: "Sol Ring", cost: "{1}", typeLine: "Artifact", price: 2.4, role: "Ramp", text: "Add {C}{C}.", already: true, legendary: false },
  { name: "The Ur-Dragon", cost: "{4}{W}{U}{B}{R}{G}", typeLine: "Legendary Creature — Dragon Avatar", price: 12.8, role: "Win Condition", text: "Flying. Each other dragon you control has flying. Whenever one or more Dragons you control attack, target player exiles cards from the top of their library.", already: false, legendary: true },
  { name: "Arcane Signet", cost: "{1}", typeLine: "Artifact", price: 1.9, role: "Ramp", text: "Add one mana of any color in your commander's color identity.", already: false, legendary: false },
  { name: "Cyclonic Rift", cost: "{1}{U}", typeLine: "Instant", price: 9.5, role: "Board Wipe", text: "Return target permanent you don't control to its owner's hand. Overload {6}{U}.", already: false, legendary: false },
  { name: "Smothering Tithe", cost: "{3}{W}", typeLine: "Enchantment", price: 14.2, role: "Card Draw", text: "Whenever an opponent draws a card except the first one they draw in each of their draw steps, you may create a Treasure token unless that player pays {2}.", already: false, legendary: false },
  { name: "Reliquary Tower", cost: null, typeLine: "Land", price: null, role: "Land", text: "You have no maximum hand size. {T}: Add {C}.", already: true, legendary: false },
  { name: "命運の分岐点、無限の彼方へ向かう旅人の試練", cost: "{3}{W}{U}{B}{R}{G}", typeLine: "Legendary Artifact Creature — Avatar", price: 44.0, role: "Win Condition", text: "A card with a very long name, to see how it wraps against the action buttons.", already: false, legendary: true },
];
