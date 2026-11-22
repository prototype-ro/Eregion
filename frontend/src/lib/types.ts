// Mirrors the backend DTOs. Keep in sync with io.eregion.*Dtos.

export type Board = "commander" | "main" | "maybe" | "considering" | "tokens";

export interface User {
  id: string;
  email: string;
  displayName: string;
  /** Whether the player proved they own the address. Needed to make a deck public. */
  emailVerified: boolean;
  /** True for the accounts allowed to moderate (EREGION_ADMIN_EMAILS). */
  admin?: boolean;
}

export interface Card {
  id: string;
  scryfallId: string;
  name: string;
  manaCost: string;
  manaValue: number;
  typeLine: string;
  primaryType: string;
  colors: string;
  colorIdentity: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  artist: string;
  priceUsd: number | null;
  imageSmall: string;
  imageNormal: string;
  imageArtCrop: string;
  /** legal, not_legal or banned in Commander, or unknown until read from Scryfall. */
  commanderLegality: string;
  /** What the card does in a deck (Ramp, Removal, ...), or null when nothing is known about it. */
  role?: string | null;
  roleSource?: string | null;
  secondaryRoles?: string[];
}

/** One printing of a card: a set, a collector number, its own art and price. */
export interface Printing {
  scryfallId: string;
  cardId: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  releasedAt: string | null;
  rarity: string;
  artist: string;
  imageSmall: string;
  imageNormal: string;
  imageArtCrop: string;
  priceUsd: number | null;
}

export interface ResolveResult {
  matches: Array<{ requested: string; card: Card }>;
  notFound: string[];
  /** Names Scryfall was too busy to check. They may exist, so trying again later can find them. */
  unchecked: string[];
}

/** A deck as listed on the decks page. The numbers describe its latest version, the one the deck opens on. */
export interface DeckSummary {
  id: string;
  name: string;
  format: string;
  latestVersion: number;
  latestBranch: string | null;
  latestOnMain: boolean;
  versionCount: number;
  branchCount: number;
  cardCount: number;
  priceUsd: number;
  commanderName: string | null;
  /** Art for the commander, or both partners. */
  artUrls: string[];
  /** The commander's colors in game order, empty for colorless. */
  colorIdentity: string;
  /** What keeps the deck from being a legal Commander deck. Empty when it is legal. */
  issues: string[];
  updatedAt: string;
  visibility: Visibility;
  publishedVersion: number | null;
  /** Pinned decks sit at the top of the list. Archived decks are hidden unless asked for. */
  pinned: boolean;
  archived: boolean;
  /** The latest version's bracket, once worked out in the background (decks of 60 or more cards). */
  bracket?: number | null;
  bracketName?: string | null;
}

export interface DeckCardLine {
  cardId: string;
  name: string;
  manaCost: string;
  manaValue: number;
  primaryType: string;
  typeLine: string;
  colors: string;
  colorIdentity: string;
  oracleText: string;
  commanderLegality: string;
  rarity: string;
  artist: string;
  imageSmall: string;
  imageNormal: string;
  imageArtCrop: string;
  /** The printing shown: a pinned one, or the card's default. */
  printingId: string;
  /** Set when the line uses the player's own art instead of a Scryfall printing. */
  customPrintingId: string | null;
  setCode: string;
  setName: string;
  collectorNumber: string;
  priceUsd: number | null;
  board: Board;
  quantity: number;
  owned: number;
  tags: string[];
  /** What the card does in a deck (Ramp, Removal, ...), or null when nothing is known about it. */
  role: string | null;
  /** Where the main role came from: scryfall (community tagged) or regex (a guess from the rules text). */
  roleSource: string | null;
  /** The card's other roles. Informational: the stats and the groups only use the main one. */
  secondaryRoles: string[];
}

export interface DeckStats {
  totalCards: number;
  averageManaValue: number;
  curve: number[];
  types: Record<string, number>;
  lands: number;
  owned: number;
  missing: number;
  totalPriceUsd: number;
  /** Cards per role, lands left out, with the cards that have no known role under "Uncategorized". */
  roles: Record<string, number>;
}

export interface VersionDetail {
  versionNumber: number;
  note: string;
  createdAt: string;
  cards: DeckCardLine[];
  stats: DeckStats;
  branchId: string;
  branchName: string;
  /** The version this one was made from. Null for the very first version. */
  parentVersion: number | null;
  /** True when nothing newer exists on this version's branch. */
  head: boolean;
}

export interface VersionSummary {
  versionNumber: number;
  note: string;
  createdAt: string;
  cardCount: number;
  averageManaValue: number;
  branchId: string;
  parentVersion: number | null;
  /** For a merge version: the newest version of the branch that was merged in. */
  mergeParent: number | null;
  /** Cards added to and removed from the parent version. */
  added: number;
  removed: number;
}

/** One line of development. It split off from forkedFromVersion. main is the line others merge into. */
export interface Branch {
  id: string;
  name: string;
  forkedFromVersion: number | null;
  main: boolean;
  versions: VersionSummary[];
}

export interface Timeline {
  branches: Branch[];
}

export interface DeckDetail {
  id: string;
  name: string;
  format: string;
  createdAt: string;
  updatedAt: string;
  latest: VersionDetail | null;
  visibility: Visibility;
  /** The version number shown on Explore, when the deck is public. */
  publishedVersion: number | null;
  description: string;
  /** Whether the public page shows the versions that led to the published one. */
  publicHistory: boolean;
  /** The bracket the owner says the deck is, or null. */
  declaredBracket?: number | null;
}

export interface CardChange {
  cardId: string;
  name: string;
  manaCost: string;
  manaValue: number;
  primaryType: string;
  board: Board;
  quantity: number;
}

export interface QuantityChange {
  cardId: string;
  name: string;
  board: Board;
  from: number;
  to: number;
}

export interface StatsChange {
  from: DeckStats;
  to: DeckStats;
  averageManaValueDelta: number;
  curveDelta: number[];
  typeDelta: Record<string, number>;
  totalDelta: number;
  landsDelta: number;
  roleDelta: Record<string, number>;
}

export interface DeckDiff {
  fromVersion: number;
  toVersion: number;
  printings: PrintingChange[];
  tags: TagChange[];
  added: CardChange[];
  removed: CardChange[];
  changed: QuantityChange[];
  stats: StatsChange;
}

export type Visibility = "private" | "public";

/** A published deck in the Explore list. */
export interface PublicDeck {
  id: string;
  name: string;
  ownerName: string;
  commanderName: string | null;
  artUrl: string | null;
  colorIdentity: string;
  versionNumber: number;
  cardCount: number;
  priceUsd: number;
  publishedAt: string;
  mine: boolean;
  description: string;
  /** The published version's bracket, once worked out. */
  bracket?: number | null;
  bracketName?: string | null;
  /** The bracket the owner says the deck is, or null. */
  declaredBracket?: number | null;
  /** For the author's page. */
  ownerId?: string;
  /** The first commander, for its page. */
  commanderId?: string | null;
}

export interface PublicDeckDetail {
  deck: PublicDeck;
  cards: DeckCardLine[];
  stats: DeckStats;
  /** The card art behind the deck's header, or null for the commander's art. */
  backdrop?: import("./backdrop").Backdrop | null;
}

export interface PrintingChange {
  cardId: string;
  name: string;
  board: Board;
  from: string;
  to: string;
}

export interface TagChange {
  cardId: string;
  name: string;
  board: Board;
  added: string[];
  removed: string[];
}

/** Art a player uploaded for a card, such as a proxy. Only they can use it, and only for that card. */
export interface CustomPrinting {
  id: string;
  cardId: string;
  label: string;
  createdAt: string;
  /** How many saved deck versions use it. */
  usedIn: number;
}

/** One side of a merge conflict. A null quantity means the card is not in that version. */
export interface MergeSide {
  quantity: number | null;
  printing: string;
  tags: string[];
}

export interface MergeConflict {
  cardId: string;
  name: string;
  board: Board;
  base: MergeSide;
  ours: MergeSide;
  theirs: MergeSide;
}

export interface MergePreview {
  sourceBranch: string;
  sourceVersion: number;
  mainVersion: number;
  baseVersion: number | null;
  upToDate: boolean;
  /** What main would gain and lose, leaving conflicts out. */
  changes: DeckDiff;
  conflicts: MergeConflict[];
}

/** One card on one board in one version of a deck. */
export interface CardAppearance {
  versionNumber: number;
  board: Board;
  quantity: number;
  printing: string;
  tags: string[];
}

/** How far a branch is from main. ahead and behind count versions, like git. */
export interface BranchStatus {
  branchId: string;
  name: string;
  ahead: number;
  behind: number;
  baseVersion: number | null;
  headVersion: number;
  mainVersion: number;
}

// ---- deck analysis (POST /api/analysis) ----

export interface AnalysisComposition {
  medianManaValue: number;
  /** Coloured pips in the costs of the non-land cards, by colour W U B R G. */
  pips: Record<string, number>;
  /** Cards that can make each colour (W U B R G) or colourless (C). */
  sources: Record<string, number>;
  /** Cards that make coloured mana at all; a dual land counts once. Absent from older answers. */
  producers?: number;
}

export interface AnalysisConsistency {
  libraryCards: number;
  lands: number;
  cheapRamp: number;
  expectedOpeningLands: number;
  landDropTurn2: number;
  landDropTurn3: number;
  landDropTurn4: number;
  rampByTurn2: number;
  rampByTurn3: number;
  twoRampByTurn3: number;
  keepableOpener: number;
  /** Null without a commander. */
  commanderOnCurve: number | null;
  /** Chance of at least one source of each colour of the identity by turn 3. */
  colorAccessTurn3: Record<string, number>;
}

export interface AnalysisSignals {
  gameChangers: number;
  gameChangerCards: string[];
  massLandDenial: number;
  massLandDenialCards: string[];
  extraTurns: number;
  extraTurnCards: string[];
  tutors: number;
  unconditionalTutors: number;
  fastMana: number;
  fastManaCards: string[];
  /** Null when combo data was unavailable. */
  twoCardCombos: number | null;
  earlyTwoCardCombos: number | null;
  winCombos: number | null;
  /** Combos that end the game by themselves; null when combo data was unavailable. */
  endingCombos: number | null;
  endingTwoCardCombos: number | null;
  earlyEndingTwoCardCombos: number | null;
  /** Tutors weighted by how freely they find a card. */
  weightedTutors: number | null;
  /** Spells that put a creature into play from a graveyard. */
  reanimation: number | null;
}

export interface AnalysisReason {
  kind: string;
  bracket: number;
  text: string;
  cards: string[];
}

export interface AnalysisBracket {
  floor: number;
  estimated: number;
  bracket: number;
  name: string;
  basis: string;
  score: number;
  scoreParts: Record<string, number>;
  signals: AnalysisSignals;
  reasons: AnalysisReason[];
  whatWouldChange: string[];
  note: string | null;
}

export interface AnalysisCombo {
  id: string;
  cards: string[];
  missing: string[];
  produces: string[];
  description: string;
  manaNeeded: string;
  manaValueNeeded: number | null;
  bracketTag: string;
  popularity: number;
}

export interface AnalysisCombos {
  available: boolean;
  included: AnalysisCombo[];
  oneCardAway: AnalysisCombo[];
}

export interface AnalysisTheme {
  name: string;
  score: number;
  cards: string[];
}

export interface AnalysisEngine {
  primary: string;
  description: string;
  confidence: number;
  runnerUp: string | null;
  ambiguous: boolean;
  themes: AnalysisTheme[];
  tribe: string | null;
  signatureCards: string[];
}

export interface AnalysisSpeed {
  games: number;
  /** Average mana left for spells on turns 1 to 8, after ramp has been played. */
  manaByTurn: number[];
  /** The turn the commander could first be cast in half the games, or null. */
  commanderTurn: number | null;
  /** Chance the commander can be cast by turns "3" to "6". */
  commanderByTurn: Record<string, number>;
  /** The turn a game-ending combo could first be executed in half the games, or null. */
  comboTurn: number | null;
  /** Chance a game-ending combo can be executed by turns "4", "6", "8" and "10". Empty without such a combo. */
  comboByTurn: Record<string, number>;
  /** Average turn a game-ending combo was ready, counting games that never got there as turn 12; null without such a combo. */
  comboMean?: number | null;
  assumptions: string[];
}

export interface AnalysisWinTurn {
  turn: number;
  /** "combo" when a game-ending combo is quicker than the signals suggest, otherwise "signals". */
  basis: string;
  /** The bracket whose turn range holds this turn, 1 to 5. */
  bracket: number;
}

export interface AnalysisHealthSpoke {
  key: string;
  label: string;
  observed: number;
  min: number;
  max: number;
  score: number;
  hint: string;
  cards: string[];
}

export interface AnalysisHealthPillar {
  key: string;
  label: string;
  score: number;
  spokes: AnalysisHealthSpoke[];
}

export interface AnalysisHealth {
  score: number;
  pillars: AnalysisHealthPillar[];
  note: string;
}

export interface AnalysisArchenemyPattern {
  key: string;
  label: string;
  text: string;
  points: number;
  cards: string[];
}

export interface AnalysisArchenemy {
  score: number;
  /** Zero-based step on the scale. */
  level: number;
  name: string;
  levels: string[];
  patterns: AnalysisArchenemyPattern[];
}

/** Every block can be null: a block the server cannot work out is left out, never zeroed. */
export interface DeckAnalysis {
  composition: AnalysisComposition | null;
  consistency: AnalysisConsistency | null;
  bracket: AnalysisBracket | null;
  combos: AnalysisCombos | null;
  engine: AnalysisEngine | null;
  speed: AnalysisSpeed | null;
  winTurn: AnalysisWinTurn | null;
  health: AnalysisHealth | null;
  archenemy: AnalysisArchenemy | null;
}

export type ProxyMode = "NICKNAME" | "RESKIN";

export interface ProxyCharacter {
  tier: string;
  who: string;
  race: string;
  role: string;
  signature: string;
}

export interface ProxyGeneration {
  id: string;
  createdAt: string;
  instruction: string | null;
  nickname: string | null;
  character: ProxyCharacter;
  prompt: string;
  model: string;
}

export interface ProxyTreatment {
  id: string;
  cardId: string;
  mode: ProxyMode;
  currentGenerationId: string | null;
  current: ProxyGeneration | null;
}

export interface ProxyChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface DeckLore {
  lore: string | null;
  mjParams: string | null;
}

/** ADDITION mutates the subject but keeps its personhood; ERASURE subtracts until it keeps only a title or function. */
export type LoreMechanism = "ADDITION" | "ERASURE";

export interface LoreCosmology {
  overview: string;
  forces: string[];
}

export interface LoreGroup {
  id: string;
  name: string;
  description: string;
  traits: string;
}

export interface LoreColor {
  id: string;
  faction: string;
  color: string;
  meaning: string;
}

export interface LoreCharacter {
  id: string;
  name: string;
  group: string;
  race: string;
  role: string;
  signature: string;
}

/** The structured setting: cosmology, races/tribes/factions, tales, signature colours, characters, naming and open gaps. */
export interface LoreDoc {
  cosmology: LoreCosmology;
  groups: LoreGroup[];
  tales: string[];
  colors: LoreColor[];
  characters: LoreCharacter[];
  naming: string;
  gaps: string[];
  /** The real franchise this lore draws on (e.g. "Marvel Comics"), or null when the setting was invented from scratch. */
  canonSource: string | null;
}

export interface LoreProblem {
  rule: string;
  message: string;
}

export interface LoreVerdict {
  fits: boolean;
  problems: LoreProblem[];
}

export interface LoreTurnMessage {
  role: "user" | "assistant";
  text: string;
}

export interface LoreTurnReply {
  reply: string;
  doc: LoreDoc;
}

