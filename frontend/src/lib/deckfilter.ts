import type { DeckSummary } from "./types";

export type DeckSort = "updated" | "name" | "price" | "cards";
export type DeckDirection = "asc" | "desc";

export const DECK_SORTS: Array<[DeckSort, string]> = [
  ["updated", "Last edited"],
  ["name", "Name"],
  ["price", "Price"],
  ["cards", "Card count"],
];

/** The direction that reads most naturally for each sort: newest, A to Z, dearest, fullest. */
export const DEFAULT_DIRECTION: Record<DeckSort, DeckDirection> = { updated: "desc", name: "asc", price: "desc", cards: "desc" };

export interface DeckFilters {
  query: string;
  visibility: "all" | "public" | "private";
  legality: "all" | "legal" | "issues";
  /** Colors a deck must include. "C" means colorless, and cannot be combined with the others. */
  colors: string[];
  /** Archived decks are tucked away until asked for. */
  status: "active" | "archived" | "all";
}

export const NO_FILTERS: DeckFilters = { query: "", visibility: "all", legality: "all", colors: [], status: "active" };

/** Showing only active decks is the normal state, so it does not count as filtering. */
export const isFiltering = (filters: DeckFilters) =>
  filters.query.trim() !== "" || filters.visibility !== "all" || filters.legality !== "all" || filters.colors.length > 0 || filters.status !== "active";

/** A deck with no versions is not "legal" or "not legal" yet, so a legality filter leaves it out. */
const hasCards = (deck: DeckSummary) => deck.latestVersion > 0;

export function matches(deck: DeckSummary, filters: DeckFilters): boolean {
  if (filters.status === "active" && deck.archived) return false;
  if (filters.status === "archived" && !deck.archived) return false;
  const query = filters.query.trim().toLowerCase();
  if (query && !deck.name.toLowerCase().includes(query) && !(deck.commanderName ?? "").toLowerCase().includes(query)) return false;
  if (filters.visibility !== "all" && deck.visibility !== filters.visibility) return false;
  if (filters.legality === "legal" && !(hasCards(deck) && deck.issues.length === 0)) return false;
  if (filters.legality === "issues" && !(hasCards(deck) && deck.issues.length > 0)) return false;
  if (filters.colors.length > 0) {
    if (filters.colors.includes("C")) return deck.commanderName !== null && deck.colorIdentity === "";
    if (!filters.colors.every((color) => deck.colorIdentity.includes(color))) return false;
  }
  return true;
}

/** How many decks are drawn at first, and how many more each press of "Show more" adds. */
export const PAGE_SIZE = 24;

export function sortDecks(decks: DeckSummary[], sort: DeckSort, direction: DeckDirection): DeckSummary[] {
  const sign = direction === "asc" ? 1 : -1;
  const byName = (a: DeckSummary, b: DeckSummary) => a.name.localeCompare(b.name);
  const primary = (a: DeckSummary, b: DeckSummary): number => {
    switch (sort) {
      case "name":
        return byName(a, b);
      case "price":
        return a.priceUsd - b.priceUsd;
      case "cards":
        return a.cardCount - b.cardCount;
      default:
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    }
  };
  // Pinned decks stay on top whatever the order, and are sorted among themselves the same way.
  return [...decks].sort((a, b) => Number(b.pinned) - Number(a.pinned) || sign * primary(a, b) || byName(a, b));
}

/** "3 days ago" style text for when a deck was last edited. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
