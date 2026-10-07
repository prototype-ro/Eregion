import assert from "node:assert/strict";
import { test } from "node:test";
import { comparator, groupLines, identityTitle, subtypes } from "./groups.ts";
import type { Board, DeckCardLine } from "./types";

let n = 0;
function card(over: Partial<DeckCardLine>): DeckCardLine {
  n += 1;
  return {
    cardId: `c${n}`, name: `Card ${n}`, manaCost: "", manaValue: 1, primaryType: "Instant", typeLine: "Instant", colors: "", colorIdentity: "",
    oracleText: "", rarity: "common", artist: "", imageSmall: "", imageNormal: "", imageArtCrop: "", printingId: "", customPrintingId: null,
    setCode: "tst", setName: "Test Set", collectorNumber: "1", priceUsd: null, board: "main" as Board, quantity: 1, owned: 0, tags: [], ...over,
  };
}
const titles = (groups: ReturnType<typeof groupLines>) => groups.map((g) => g.title);
const names = (lines: DeckCardLine[]) => lines.map((l) => l.name);

test("subtypes come from after the dash, for every face", () => {
  assert.deepEqual(subtypes("Legendary Creature — Angel Horror"), ["Angel", "Horror"]);
  assert.deepEqual(subtypes("Creature - Human Wizard"), ["Human", "Wizard"]);
  assert.deepEqual(subtypes("Instant"), []);
  assert.deepEqual(subtypes("Creature — Human // Creature — Werewolf"), ["Human", "Werewolf"]);
  assert.deepEqual(subtypes("Artifact — Equipment"), ["Equipment"]);
});

test("subtype groups list a card under each subtype and put cards without one last", () => {
  const groups = groupLines(
    [card({ name: "A", primaryType: "Creature", typeLine: "Creature — Human Wizard" }), card({ name: "B", typeLine: "Instant" }), card({ name: "C", primaryType: "Creature", typeLine: "Creature — Human" })],
    "subtype",
  );

  assert.deepEqual(titles(groups), ["Human", "Wizard", "No subtype"]);
  assert.deepEqual(names(groups[0].lines), ["A", "C"]);
});

test("type & tags puts tagged cards in their tag and the rest under their type", () => {
  const groups = groupLines(
    [card({ name: "Ring", primaryType: "Artifact", typeLine: "Artifact", tags: ["Ramp"] }), card({ name: "Bolt", primaryType: "Instant" }), card({ name: "Bear", primaryType: "Creature", typeLine: "Creature — Bear" })],
    "typeTags",
  );

  assert.deepEqual(titles(groups), ["Ramp", "Creatures", "Instants"]);
});

test("color identity groups by identity in game order with names for combinations", () => {
  const groups = groupLines(
    [card({ name: "A", colorIdentity: "BW" }), card({ name: "B", colorIdentity: "" }), card({ name: "C", colorIdentity: "G" }), card({ name: "D", colorIdentity: "WB" }), card({ name: "E", colorIdentity: "WUBRG" })],
    "identity",
  );

  assert.deepEqual(titles(groups), ["Colorless", "Green", "Orzhov", "Five-color"]);
  assert.deepEqual(names(groups[2].lines), ["A", "D"]);
  assert.equal(identityTitle("UBR"), "Grixis");
});

test("set groups use the set name and keep custom art apart at the end", () => {
  const groups = groupLines(
    [card({ name: "A", setName: "Zendikar" }), card({ name: "B", setName: "Alara", setCode: "ala" }), card({ name: "C", customPrintingId: "x", setName: "my proxy", setCode: "custom" })],
    "set",
  );

  assert.deepEqual(titles(groups), ["Alara", "Zendikar", "Custom art"]);
});

test("the commander always stays in its own first group", () => {
  const groups = groupLines([card({ name: "Boss", board: "commander" }), card({ name: "A" })], "subtype");

  assert.equal(groups[0].title, "Commander");
});

test("sorting orders cards inside each group, ascending", () => {
  const a = card({ name: "A", manaValue: 3, priceUsd: 1, rarity: "common", colors: "G", primaryType: "Creature" });
  const b = card({ name: "B", manaValue: 1, priceUsd: 50, rarity: "mythic", colors: "W", primaryType: "Creature" });
  const c = card({ name: "C", manaValue: 2, priceUsd: null, rarity: "rare", colors: "", primaryType: "Creature" });
  const sorted = (mode: Parameters<typeof comparator>[0], dir: "asc" | "desc" = "asc") => names([a, b, c].sort(comparator(mode, dir)));

  assert.deepEqual(sorted("name"), ["A", "B", "C"]);
  assert.deepEqual(sorted("mv"), ["B", "C", "A"]);
  assert.deepEqual(sorted("price"), ["A", "B", "C"]);
  assert.deepEqual(sorted("rarity"), ["A", "C", "B"]);
  assert.deepEqual(sorted("color"), ["B", "A", "C"]);
});

test("descending reverses each order", () => {
  const a = card({ name: "A", manaValue: 3, priceUsd: 1, rarity: "common", colors: "G", primaryType: "Creature" });
  const b = card({ name: "B", manaValue: 1, priceUsd: 50, rarity: "mythic", colors: "W", primaryType: "Creature" });
  const c = card({ name: "C", manaValue: 2, priceUsd: null, rarity: "rare", colors: "", primaryType: "Creature" });
  const sorted = (mode: Parameters<typeof comparator>[0]) => names([a, b, c].sort(comparator(mode, "desc")));

  assert.deepEqual(sorted("name"), ["C", "B", "A"]);
  assert.deepEqual(sorted("mv"), ["A", "C", "B"]);
  assert.deepEqual(sorted("rarity"), ["B", "C", "A"]);
  assert.deepEqual(sorted("color"), ["C", "A", "B"]);
});

test("a card with no price goes last in both directions", () => {
  const cheap = card({ name: "Cheap", priceUsd: 1 });
  const dear = card({ name: "Dear", priceUsd: 50 });
  const none = card({ name: "None", priceUsd: null });

  assert.deepEqual(names([none, dear, cheap].sort(comparator("price", "asc"))), ["Cheap", "Dear", "None"]);
  assert.deepEqual(names([none, cheap, dear].sort(comparator("price", "desc"))), ["Dear", "Cheap", "None"]);
});

test("equal values fall back to the name", () => {
  const x = card({ name: "X", manaValue: 2 });
  const y = card({ name: "Y", manaValue: 2 });

  assert.deepEqual(names([y, x].sort(comparator("mv"))), ["X", "Y"]);
});

test("sort applies inside every group mode", () => {
  const lines = [card({ name: "A", manaValue: 3, primaryType: "Creature" }), card({ name: "B", manaValue: 1, primaryType: "Creature" })];

  assert.deepEqual(names(groupLines(lines, "type", "mv")[0].lines), ["B", "A"]);
  assert.deepEqual(names(groupLines(lines, "color", "mv")[0].lines), ["B", "A"]);
  assert.deepEqual(names(groupLines(lines, "type", "mv", "desc")[0].lines), ["A", "B"]);
});
