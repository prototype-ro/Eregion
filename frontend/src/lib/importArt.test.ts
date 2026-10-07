import assert from "node:assert/strict";
import { test } from "node:test";
import { inheritArt } from "./importArt.ts";
import type { DeckCardLine } from "./types";

function line(over: Partial<DeckCardLine>): DeckCardLine {
  return {
    cardId: "c", name: "Card", manaCost: "", manaValue: 1, primaryType: "Instant", typeLine: "Instant", colors: "", colorIdentity: "", oracleText: "",
    commanderLegality: "legal", rarity: "common", artist: "Default Artist", imageSmall: "default-s", imageNormal: "default-n", imageArtCrop: "default-a",
    printingId: "default-printing", customPrintingId: null, setCode: "dft", setName: "Default", collectorNumber: "1", priceUsd: 1, board: "main",
    quantity: 1, owned: 0, tags: [], ...over,
  };
}

const pinned = (id: string) => line({ cardId: id, printingId: "pinned-" + id, setCode: "pin", setName: "Pinned", collectorNumber: "99", artist: "Pinned Artist", imageNormal: "pinned-n", priceUsd: 40 });
const custom = (id: string) => line({ cardId: id, customPrintingId: "art-" + id, setCode: "custom", setName: "my proxy", artist: "Custom art", imageNormal: "/api/custom-printings/art-" + id + "/image", imageSmall: "custom-s", imageArtCrop: "custom-a" });

test("a card that had a chosen printing keeps it", () => {
  const { lines, inherited } = inheritArt([pinned("a")], [line({ cardId: "a", quantity: 3 })]);

  assert.equal(inherited, 1);
  assert.equal(lines[0].printingId, "pinned-a");
  assert.equal(lines[0].setName, "Pinned");
  assert.equal(lines[0].priceUsd, 40);
  assert.equal(lines[0].quantity, 3);
});

test("a card that had custom art keeps it", () => {
  const { lines } = inheritArt([custom("a")], [line({ cardId: "a" })]);

  assert.equal(lines[0].customPrintingId, "art-a");
  assert.equal(lines[0].imageNormal, "/api/custom-printings/art-a/image");
  assert.equal(lines[0].artist, "Custom art");
});

test("custom art wins over a printing when the card was in the deck twice", () => {
  const { lines } = inheritArt([pinned("a"), { ...custom("a"), board: "maybe" }], [line({ cardId: "a" })]);

  assert.equal(lines[0].customPrintingId, "art-a");
});

test("cards that were not in the deck keep their default art", () => {
  const { lines, inherited } = inheritArt([pinned("a")], [line({ cardId: "b" })]);

  assert.equal(inherited, 0);
  assert.equal(lines[0].printingId, "default-printing");
});

test("a card on another board still inherits", () => {
  const { lines } = inheritArt([{ ...pinned("a"), board: "maybe" }], [line({ cardId: "a", board: "main" })]);

  assert.equal(lines[0].printingId, "pinned-a");
  assert.equal(lines[0].board, "main");
});

test("nothing is counted when the art is already the same", () => {
  const { lines, inherited } = inheritArt([line({ cardId: "a" })], [line({ cardId: "a" })]);

  assert.equal(inherited, 0);
  assert.equal(lines.length, 1);
});

test("quantity, tags and board of the new line are kept", () => {
  const { lines } = inheritArt([{ ...pinned("a"), tags: ["Old"], quantity: 9 }], [line({ cardId: "a", tags: ["New"], quantity: 2, board: "commander" })]);

  assert.deepEqual(lines[0].tags, ["New"]);
  assert.equal(lines[0].quantity, 2);
  assert.equal(lines[0].board, "commander");
});

test("an empty previous list changes nothing", () => {
  const incoming = [line({ cardId: "a" })];

  assert.deepEqual(inheritArt([], incoming).lines, incoming);
});
