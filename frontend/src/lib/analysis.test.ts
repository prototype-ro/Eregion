import assert from "node:assert/strict";
import { test } from "node:test";
import { analysisKey, analysisRequest, basisLabel, chanceWord, healthTone, healthWord, percent, stepStrength, turnLabel, turnPosition } from "./analysis.ts";
import type { Board, DeckCardLine } from "./types";

function line(cardId: string, board: Board, quantity = 1): DeckCardLine {
  return {
    cardId, name: cardId, manaCost: "", manaValue: 1, primaryType: "Instant", typeLine: "Instant", colors: "", colorIdentity: "", oracleText: "",
    rarity: "common", artist: "", imageSmall: "", imageNormal: "", imageArtCrop: "", printingId: "", customPrintingId: null, setCode: "tst",
    setName: "Test", collectorNumber: "1", priceUsd: null, board, quantity, owned: 0, tags: [], role: null, roleSource: null, secondaryRoles: [],
  } as DeckCardLine;
}

test("only the commander and main boards are sent, with their counts", () => {
  const request = analysisRequest([line("a", "commander"), line("b", "main", 3), line("c", "maybe"), line("d", "tokens"), line("e", "considering")]);
  assert.deepEqual(request.cards, [
    { cardId: "a", board: "commander", quantity: 1 },
    { cardId: "b", board: "main", quantity: 3 },
  ]);
});

test("a basic land pile is capped at what the server accepts", () => {
  assert.equal(analysisRequest([line("forest", "main", 250)]).cards[0].quantity, 99);
});

test("the key ignores order but not the board or the count", () => {
  const one = analysisKey(analysisRequest([line("a", "main"), line("b", "main", 2)]));
  const two = analysisKey(analysisRequest([line("b", "main", 2), line("a", "main")]));
  assert.equal(one, two);
  assert.notEqual(one, analysisKey(analysisRequest([line("a", "main"), line("b", "main", 3)])));
  assert.notEqual(analysisKey(analysisRequest([line("a", "main")])), analysisKey(analysisRequest([line("a", "commander")])));
});

test("percent never claims certainty it does not have", () => {
  assert.equal(percent(0.775), "78%");
  assert.equal(percent(0.0004), "<1%");
  assert.equal(percent(0.9996), ">99%");
  assert.equal(percent(0), "0%");
  assert.equal(percent(1), "100%");
});

test("chance words follow the cut-offs", () => {
  assert.equal(chanceWord(0.2), "low");
  assert.equal(chanceWord(0.6), "fair");
  assert.equal(chanceWord(0.8), "good");
  assert.equal(chanceWord(0.95), "very good");
});

test("an unknown basis is shown as sent", () => {
  assert.equal(basisLabel("speed"), "Set by how fast the deck looks");
  assert.equal(basisLabel("future_rule"), "future_rule");
});

test("a turn sits in a straight line from slow on the left to fast on the right", () => {
  assert.equal(turnPosition(12), 0);
  assert.equal(turnPosition(10), 20);
  assert.equal(turnPosition(7), 50);
  assert.equal(turnPosition(2), 100);
  assert.equal(turnPosition(30), 0);
  assert.equal(turnPosition(0), 100);
});

test("health scores read as good, fair or poor at the cut-offs", () => {
  assert.equal(healthTone(100), "good");
  assert.equal(healthTone(75), "good");
  assert.equal(healthTone(74), "fair");
  assert.equal(healthTone(50), "fair");
  assert.equal(healthTone(49), "poor");
});

test("a scale takes the accent more strongly step by step", () => {
  assert.equal(stepStrength(0, 10), 0.4);
  assert.equal(stepStrength(9, 10), 1);
  assert.ok(stepStrength(4, 10) < stepStrength(5, 10));
  assert.equal(stepStrength(0, 1), 1);
  assert.equal(stepStrength(99, 10), 1);
});

test("health always has a word, so colour is never the only signal", () => {
  assert.equal(healthWord(90), "Healthy");
  assert.equal(healthWord(60), "Fair");
  assert.equal(healthWord(10), "Needs work");
});

test("whole turns drop the decimal", () => {
  assert.equal(turnLabel(6), "6");
  assert.equal(turnLabel(6.8), "6.8");
});
