// Mirrors the backend DTOs. Keep in sync with io.eregion.*Dtos.

export type Board = "commander" | "main" | "maybe" | "considering";

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthResponse {
  token: string;
  user: User;
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
  setCode: string;
  rarity: string;
  artist: string;
  imageSmall: string;
  imageNormal: string;
  imageArtCrop: string;
}

export interface DeckSummary {
  id: string;
  name: string;
  format: string;
  latestVersion: number;
  cardCount: number;
  commanderName: string | null;
  artUrl: string | null;
  updatedAt: string;
}

export interface DeckCardLine {
  cardId: string;
  name: string;
  manaCost: string;
  manaValue: number;
  primaryType: string;
  typeLine: string;
  colors: string;
  imageSmall: string;
  imageNormal: string;
  imageArtCrop: string;
  board: Board;
  quantity: number;
  owned: number;
}

export interface DeckStats {
  totalCards: number;
  averageManaValue: number;
  curve: number[];
  types: Record<string, number>;
  lands: number;
  owned: number;
  missing: number;
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
}

/** One line of development. It split off from forkedFromVersion, or is the original line when null. */
export interface Branch {
  id: string;
  name: string;
  forkedFromVersion: number | null;
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
}

export interface DeckDiff {
  fromVersion: number;
  toVersion: number;
  added: CardChange[];
  removed: CardChange[];
  changed: QuantityChange[];
  stats: StatsChange;
}
