import assert from "node:assert/strict";
import { test } from "node:test";
import { exportDeck } from "./export.ts";
import { parseDecklist } from "./decklist.ts";
import type { DeckCardLine } from "./types";

function line(over: Partial<DeckCardLine>): DeckCardLine {
  return {
    cardId: over.name ?? "x", name: "X", manaCost: "", manaValue: 1, primaryType: "Instant", typeLine: "Instant", colors: "", colorIdentity: "", oracleText: "",
    commanderLegality: "legal", rarity: "common", artist: "", imageSmall: "", imageNormal: "", imageArtCrop: "", printingId: "", customPrintingId: null,
    setCode: "c21", setName: "Commander 2021", collectorNumber: "263", priceUsd: 1.5, board: "main", quantity: 1, owned: 0, tags: [], ...over,
  };
}

const deck = [
  line({ name: "Atraxa, Praetors' Voice", board: "commander", setCode: "2xm", collectorNumber: "190" }),
  line({ name: "Sol Ring" }),
  line({ name: "Forest", quantity: 12, setCode: "unf", collectorNumber: "300", priceUsd: null }),
  line({ name: "Cultivate", board: "maybe", tags: ["Ramp", "Lands"] }),
  line({ name: "Rhystic Study", board: "considering", customPrintingId: "art", setCode: "custom", setName: "my proxy" }),
];

test("plain list has sections and no sets", () => {
  const result = exportDeck(deck, "plain", "My Deck");

  assert.equal(result.text, "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n12 Forest\n1 Sol Ring");
  assert.equal(result.cards, 14);
  assert.equal(result.filename, "my-deck.txt");
});

test("with sets adds the printing", () => {
  const result = exportDeck(deck, "sets", "My Deck");

  assert.match(result.text, /1 Atraxa, Praetors' Voice \(2XM\) 190/);
  assert.match(result.text, /12 Forest \(UNF\) 300/);
});

test("the bench is left out unless asked for", () => {
  assert.doesNotMatch(exportDeck(deck, "plain", "d").text, /Cultivate/);
  const withBench = exportDeck(deck, "plain", "d", true);

  assert.match(withBench.text, /Maybeboard\n1 Cultivate/);
  assert.match(withBench.text, /Considering\n1 Rhystic Study/);
  assert.equal(withBench.cards, 16);
});

test("custom art never leaks into the printing", () => {
  assert.match(exportDeck(deck, "sets", "d", true).text, /1 Rhystic Study$/m);
});

test("arena has a commander block and a deck block", () => {
  const result = exportDeck(deck, "arena", "d", true);

  assert.equal(result.text, "Commander\n1 Atraxa, Praetors' Voice (2XM) 190\n\nDeck\n12 Forest (UNF) 300\n1 Sol Ring (C21) 263");
});

test("mtgo puts the commander in the sideboard", () => {
  assert.equal(exportDeck(deck, "mtgo", "d").text, "12 Forest\n1 Sol Ring\n\nSB: 1 Atraxa, Praetors' Voice");
});

test("csv has a header, quotes where needed and tags", () => {
  const result = exportDeck(deck, "csv", "d", true);
  const rows = result.text.split("\n");

  assert.equal(rows[0], "Quantity,Name,Board,Set,Collector Number,Tags,Price USD");
  assert.equal(rows[1], '1,"Atraxa, Praetors\' Voice",commander,2XM,190,,1.5');
  assert.ok(rows.includes('1,Cultivate,maybe,C21,263,Ramp; Lands,1.5'));
  assert.ok(rows.includes("1,Rhystic Study,considering,,,,1.5"));
  assert.equal(result.mime, "text/csv;charset=utf-8");
  assert.equal(result.filename, "d.csv");
});

test("what is exported can be imported again", () => {
  for (const format of ["plain", "sets", "arena"] as const) {
    const parsed = parseDecklist(exportDeck(deck, format, "d").text);
    const forest = parsed.entries.find((entry) => entry.name === "Forest");

    assert.equal(forest?.quantity, 12, format);
    assert.equal(parsed.entries.find((entry) => entry.board === "commander")?.name, "Atraxa, Praetors' Voice", format);
    assert.equal(parsed.ignored.length, 0, format);
  }
});

test("a deck name becomes a safe file name", () => {
  assert.equal(exportDeck([], "plain", "Atraxa: Superfriends / 2026!").filename, "atraxa-superfriends-2026.txt");
  assert.equal(exportDeck([], "plain", "???").filename, "deck.txt");
});
