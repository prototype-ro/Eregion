import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkLegality, copyLimit } from "./legality.ts";
import type { DeckCardLine } from "./types";

interface SharedLine {
  name: string;
  board: DeckCardLine["board"];
  quantity: number;
  colorIdentity: string;
  typeLine: string;
  oracleText: string;
  commanderLegality: string;
}

interface SharedCase {
  name: string;
  lines: SharedLine[];
  filler: number;
  fillerIdentity: string;
  issues: string[];
}

function line(over: Partial<DeckCardLine>): DeckCardLine {
  return {
    cardId: over.name ?? "x", name: "x", manaCost: "", manaValue: 1, primaryType: "Instant", typeLine: "Instant", colors: "", colorIdentity: "",
    oracleText: "", commanderLegality: "legal", rarity: "common", artist: "", imageSmall: "", imageNormal: "", imageArtCrop: "", printingId: "",
    customPrintingId: null, setCode: "", setName: "", collectorNumber: "", priceUsd: null, board: "main", quantity: 1, owned: 0, tags: [], ...over,
  };
}

// The API runs the same file, so both implementations give the same results and the same wording.
const shared = JSON.parse(readFileSync(new URL("../../../shared/legality-cases.json", import.meta.url), "utf8")) as { cases: SharedCase[] };

for (const testCase of shared.cases) {
  test(`shared case: ${testCase.name}`, () => {
    const lines = testCase.lines.map((entry) => line({ ...entry, cardId: entry.name }));
    for (let i = 0; i < testCase.filler; i++) lines.push(line({ cardId: `Filler ${i}`, name: `Filler ${i}`, colorIdentity: testCase.fillerIdentity }));

    assert.deepEqual(checkLegality(lines).issues, testCase.issues);
  });
}

test("the shared file has enough cases", () => {
  assert.ok(shared.cases.length > 30);
});

test("legal means no issues", () => {
  const lines = [line({ name: "Boss", board: "commander", typeLine: "Legendary Creature - Human", colorIdentity: "W" })];
  for (let i = 0; i < 99; i++) lines.push(line({ cardId: `F${i}`, name: `F${i}`, colorIdentity: "W" }));

  assert.deepEqual(checkLegality(lines), { legal: true, issues: [] });
});

test("copy limits read the card text", () => {
  assert.equal(copyLimit(line({ oracleText: "A deck can have up to nine cards named X." })), 9);
  assert.equal(copyLimit(line({ typeLine: "Basic Land - Forest" })), Number.MAX_SAFE_INTEGER);
  assert.equal(copyLimit(line({})), 1);
});
