import assert from "node:assert/strict";
import { test } from "node:test";
import { matches, NO_FILTERS, plural, relativeTime, sortDecks, type DeckFilters } from "./deckfilter.ts";
import type { DeckSummary } from "./types";

let n = 0;
function deck(over: Partial<DeckSummary>): DeckSummary {
  n += 1;
  return {
    id: `d${n}`, name: `Deck ${n}`, format: "commander", latestVersion: 1, latestBranch: "main", latestOnMain: true, versionCount: 1, branchCount: 1,
    cardCount: 100, priceUsd: 100, commanderName: "Boss", artUrls: [], colorIdentity: "WU", issues: [], updatedAt: "2026-01-01T00:00:00Z",
    visibility: "private", publishedVersion: null, ...over,
  };
}
const withFilters = (over: Partial<DeckFilters>): DeckFilters => ({ ...NO_FILTERS, ...over });
const ids = (decks: DeckSummary[]) => decks.map((d) => d.name);

test("search finds a deck by name or commander, ignoring case", () => {
  const atraxa = deck({ name: "Proliferate", commanderName: "Atraxa, Praetors' Voice" });
  assert.equal(matches(atraxa, withFilters({ query: "ATRAXA" })), true);
  assert.equal(matches(atraxa, withFilters({ query: "prolif" })), true);
  assert.equal(matches(atraxa, withFilters({ query: "zzz" })), false);
  assert.equal(matches(atraxa, withFilters({ query: "  " })), true);
});

test("visibility and legality filters", () => {
  const legal = deck({ issues: [], visibility: "public" });
  const broken = deck({ issues: ["3 cards short of 100."] });
  assert.equal(matches(legal, withFilters({ visibility: "public" })), true);
  assert.equal(matches(broken, withFilters({ visibility: "public" })), false);
  assert.equal(matches(legal, withFilters({ legality: "legal" })), true);
  assert.equal(matches(broken, withFilters({ legality: "legal" })), false);
  assert.equal(matches(broken, withFilters({ legality: "issues" })), true);
});

test("an empty draft is neither legal nor illegal", () => {
  const empty = deck({ latestVersion: 0, cardCount: 0, issues: ["No commander chosen."] });
  assert.equal(matches(empty, withFilters({ legality: "legal" })), false);
  assert.equal(matches(empty, withFilters({ legality: "issues" })), false);
  assert.equal(matches(empty, NO_FILTERS), true);
});

test("a color filter needs every chosen color, and colorless is its own choice", () => {
  const esper = deck({ colorIdentity: "WUB" });
  const rock = deck({ colorIdentity: "" });
  assert.equal(matches(esper, withFilters({ colors: ["W", "U"] })), true);
  assert.equal(matches(esper, withFilters({ colors: ["W", "R"] })), false);
  assert.equal(matches(rock, withFilters({ colors: ["C"] })), true);
  assert.equal(matches(esper, withFilters({ colors: ["C"] })), false);
  assert.equal(matches(deck({ commanderName: null, colorIdentity: "" }), withFilters({ colors: ["C"] })), false);
});

test("sorting by each key, both ways, with ties by name", () => {
  const a = deck({ name: "A", priceUsd: 50, cardCount: 60, updatedAt: "2026-03-01T00:00:00Z" });
  const b = deck({ name: "B", priceUsd: 10, cardCount: 100, updatedAt: "2026-01-01T00:00:00Z" });
  const c = deck({ name: "C", priceUsd: 50, cardCount: 80, updatedAt: "2026-02-01T00:00:00Z" });
  assert.deepEqual(ids(sortDecks([b, c, a], "name", "asc")), ["A", "B", "C"]);
  assert.deepEqual(ids(sortDecks([a, b, c], "name", "desc")), ["C", "B", "A"]);
  assert.deepEqual(ids(sortDecks([a, b, c], "updated", "desc")), ["A", "C", "B"]);
  assert.deepEqual(ids(sortDecks([a, b, c], "updated", "asc")), ["B", "C", "A"]);
  assert.deepEqual(ids(sortDecks([a, b, c], "price", "desc")), ["A", "C", "B"]);
  assert.deepEqual(ids(sortDecks([a, b, c], "cards", "desc")), ["B", "C", "A"]);
});

test("sorting does not change the list it is given", () => {
  const list = [deck({ name: "B" }), deck({ name: "A" })];
  sortDecks(list, "name", "asc");
  assert.deepEqual(ids(list), ["B", "A"]);
});

test("relative time reads naturally", () => {
  const now = new Date("2026-06-15T12:00:00Z").getTime();
  assert.equal(relativeTime("2026-06-15T11:59:50Z", now), "just now");
  assert.equal(relativeTime("2026-06-15T09:00:00Z", now), "3 hours ago");
  assert.equal(relativeTime("2026-06-12T12:00:00Z", now), "3 days ago");
  assert.equal(relativeTime("2026-06-14T12:00:00Z", now), "yesterday");
});

test("plural handles one", () => {
  assert.equal(plural(1, "card"), "1 card");
  assert.equal(plural(0, "card"), "0 cards");
  assert.equal(plural(2, "branch", "branches"), "2 branches");
});
