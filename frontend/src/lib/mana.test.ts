import assert from "node:assert/strict";
import { test } from "node:test";
import { describeCost, parseSymbol, splitMana } from "./mana.ts";

test("colored, generic and special symbols map to mana-font classes", () => {
  assert.equal(parseSymbol("W").icon, "ms-w");
  assert.equal(parseSymbol("u").icon, "ms-u");
  assert.equal(parseSymbol("2").icon, "ms-2");
  assert.equal(parseSymbol("10").icon, "ms-10");
  assert.equal(parseSymbol("X").icon, "ms-x");
  assert.equal(parseSymbol("C").icon, "ms-c");
  assert.equal(parseSymbol("S").icon, "ms-s");
  assert.equal(parseSymbol("T").icon, "ms-tap");
});

test("hybrid, generic hybrid and Phyrexian symbols", () => {
  assert.equal(parseSymbol("W/U").icon, "ms-wu");
  assert.equal(parseSymbol("2/W").icon, "ms-2w");
  assert.equal(parseSymbol("G/P").icon, "ms-gp");
  assert.equal(parseSymbol("W/U").label, "white or blue");
  assert.equal(parseSymbol("W/P").label, "white or 2 life");
});

test("a symbol the font does not know stays as text", () => {
  assert.equal(parseSymbol("QQ").icon, null);
  assert.equal(parseSymbol("???").icon, null);
});

test("a cost splits into symbols in order", () => {
  const pieces = splitMana("{2}{W}{U}");

  assert.deepEqual(pieces.map((p) => (p.kind === "symbol" ? p.token.icon : p.text)), ["ms-2", "ms-w", "ms-u"]);
});

test("rules text keeps its words between symbols", () => {
  const pieces = splitMana("{T}: Add {C}{C}.");

  assert.deepEqual(pieces.map((p) => (p.kind === "symbol" ? `[${p.token.icon}]` : p.text)), ["[ms-tap]", ": Add ", "[ms-c]", "[ms-c]", "."]);
});

test("a cost is read aloud", () => {
  assert.equal(describeCost("{2}{W}{U/B}"), "2 generic, white, blue or black");
  assert.equal(describeCost(""), "");
});

test("split cards keep both halves", () => {
  assert.deepEqual(splitMana("{1}{R} // {2}{W}").map((p) => (p.kind === "text" ? p.text : "s")), ["s", "s", " // ", "s", "s"]);
});
