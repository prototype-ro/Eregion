import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLegality } from "./legality.ts";
import type { DeckCardLine } from "./types";

let next = 0;
function line(over: Partial<DeckCardLine>): DeckCardLine {
  next += 1;
  return {
    cardId: `c${next}`, name: `Card ${next}`, manaCost: "", manaValue: 1, primaryType: "Instant", typeLine: "Instant",
    colors: "", colorIdentity: "", oracleText: "", rarity: "common", artist: "", imageSmall: "", imageNormal: "", imageArtCrop: "",
    printingId: "", setCode: "", setName: "", collectorNumber: "", priceUsd: null, board: "main", quantity: 1, owned: 0, tags: [],
    ...over,
  };
}
const commander = (over: Partial<DeckCardLine> = {}) =>
  line({ board: "commander", name: "Boss", typeLine: "Legendary Creature - Human", colorIdentity: "WU", ...over });
function fullDeck(extra: DeckCardLine[] = []): DeckCardLine[] {
  const filler = Array.from({ length: 99 - extra.reduce((s, l) => s + l.quantity, 0) }, () => line({ colorIdentity: "W" }));
  return [commander(), ...extra, ...filler];
}

test("a full singleton deck inside the colors is legal", () => {
  assert.deepEqual(checkLegality(fullDeck()), { legal: true, issues: [] });
});

test("wrong size is reported either way", () => {
  assert.match(checkLegality(fullDeck().slice(1)).issues[0], /1 card short/);
  assert.match(checkLegality([...fullDeck(), line({})]).issues[0], /1 card over/);
});

test("maybeboard and considering do not count", () => {
  assert.equal(checkLegality([...fullDeck(), line({ board: "maybe" }), line({ board: "considering" })]).legal, true);
});

test("no commander", () => {
  assert.ok(checkLegality(fullDeck().slice(1)).issues.includes("No commander chosen."));
});

test("a non-legendary commander cannot lead", () => {
  const r = checkLegality(fullDeck().map((l) => (l.board === "commander" ? { ...l, typeLine: "Creature - Elf" } : l)));
  assert.ok(r.issues.some((i) => /cannot be a commander/.test(i)));
});

test("two commanders need partner", () => {
  const two = (text: string) => [commander({ oracleText: text }), commander({ oracleText: text }), ...Array.from({ length: 98 }, () => line({ colorIdentity: "W" }))];
  assert.equal(checkLegality(two("Partner")).legal, true);
  assert.ok(checkLegality(two("")).issues.some((i) => /Only one commander/.test(i)));
});

test("duplicates are illegal except basics and any-number cards", () => {
  const dup = line({ name: "Sol Ring", quantity: 2 });
  assert.ok(checkLegality(fullDeck([dup])).issues.some((i) => i.includes("Sol Ring (2)")));
  assert.equal(checkLegality(fullDeck([line({ typeLine: "Basic Land - Plains", quantity: 20 })])).legal, true);
  assert.equal(checkLegality(fullDeck([line({ oracleText: "A deck can have any number of cards named Rats.", quantity: 9 })])).legal, true);
});

test("the same card on two boards counts together", () => {
  const a = line({ name: "Dup" });
  const b = { ...a, board: "commander" as const };
  assert.ok(checkLegality([commander(), a, b, ...Array.from({ length: 97 }, () => line({ colorIdentity: "W" }))]).issues.some((i) => i.includes("Dup (2)")));
});

test("cards outside the commander's colors are named", () => {
  const r = checkLegality(fullDeck([line({ name: "Lightning Bolt", colorIdentity: "R" })]));
  assert.ok(r.issues.some((i) => /Outside the commander's colors: Lightning Bolt/.test(i)));
});

test("colorless cards fit any commander", () => {
  assert.equal(checkLegality(fullDeck([line({ colorIdentity: "" })])).legal, true);
});
