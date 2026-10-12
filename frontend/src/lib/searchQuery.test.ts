import assert from "node:assert/strict";
import { test } from "node:test";
import { buildQuery, emptyForm, identityPicks, manaSymbols, terms } from "./searchQuery.ts";

test("an empty form builds nothing", () => {
  assert.equal(buildQuery(emptyForm()), "");
});

test("words stay bare, phrases and odd characters are quoted, a minus means without", () => {
  assert.deepEqual(terms("o", `flying "draw a card" -haste`), ["o:flying", 'o:"draw a card"', "-o:haste"]);
  assert.deepEqual(terms("name", "Sol'kanar"), ['name:"Sol\'kanar"']);
  assert.deepEqual(terms("t", '  "" '), []);
});

test("colors can be matched as all, any or exactly, and colorless stands alone", () => {
  assert.equal(buildQuery({ ...emptyForm(), colors: ["W", "U"], colorMode: "all" }), "c>=wu");
  assert.equal(buildQuery({ ...emptyForm(), colors: ["W", "U"], colorMode: "any" }), "(c:w or c:u)");
  assert.equal(buildQuery({ ...emptyForm(), colors: ["R"], colorMode: "any" }), "c:r");
  assert.equal(buildQuery({ ...emptyForm(), colors: ["W", "U"], colorMode: "exact" }), "c=wu");
  assert.equal(buildQuery({ ...emptyForm(), colors: ["C"] }), "c=c");
  assert.equal(buildQuery({ ...emptyForm(), colors: ["C", "G"], colorMode: "all" }), "c>=g");
});

test("identity defaults to cards that fit inside the colors, as a commander deck needs", () => {
  assert.equal(buildQuery({ ...emptyForm(), identity: ["B", "R"] }), "id<=br");
  assert.equal(buildQuery({ ...emptyForm(), identity: ["B", "R"], identityMode: "includes" }), "id>=br");
  assert.equal(buildQuery({ ...emptyForm(), identity: ["C"] }), "id=c");
});

test("numbers need to be numbers, and the comparison is kept", () => {
  const form = { ...emptyForm(), manaValue: { op: "<=" as const, value: "3" }, power: { op: ">=" as const, value: "x" }, price: { op: "<=" as const, value: "2.5" } };
  assert.equal(buildQuery(form), "mv<=3 usd<=2.5");
});

test("mana cost accepts braces or plain letters and drops anything else", () => {
  assert.equal(manaSymbols("2G"), "{2}{G}");
  assert.equal(manaSymbols("{2}{g}{W/U}"), "{2}{G}{W/U}");
  assert.equal(manaSymbols("hello"), "");
  assert.equal(buildQuery({ ...emptyForm(), manaCost: "1BB" }), "m:{1}{B}{B}");
});

test("set codes and rarities", () => {
  assert.equal(buildQuery({ ...emptyForm(), set: "CMM" }), "s:cmm");
  assert.equal(buildQuery({ ...emptyForm(), set: "not a code" }), "");
  assert.equal(buildQuery({ ...emptyForm(), rarity: ["rare"] }), "r:rare");
  assert.equal(buildQuery({ ...emptyForm(), rarity: ["rare", "mythic"] }), "(r:rare or r:mythic)");
});

test("a whole search reads the way a person would write it", () => {
  const form = { ...emptyForm(), type: "legendary creature", text: '"whenever you cast"', identity: ["B", "R"], manaValue: { op: "<=" as const, value: "4" } };
  assert.equal(buildQuery(form), 't:legendary t:creature o:"whenever you cast" id<=br mv<=4');
});

test("a commander's identity becomes picks, and colorless becomes the colorless pick", () => {
  assert.deepEqual(identityPicks("WUB"), ["W", "U", "B"]);
  assert.deepEqual(identityPicks(""), ["C"]);
});
