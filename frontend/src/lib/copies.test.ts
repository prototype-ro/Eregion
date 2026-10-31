import assert from "node:assert/strict";
import { test } from "node:test";
import { copiesLabel, copiesSpoken, pileEdges } from "./copies.ts";

test("a repeat reads as a multiplication and a single card as a plain number", () => {
  assert.equal(copiesLabel(1), "1");
  assert.equal(copiesLabel(2), "2×");
  assert.equal(copiesLabel(36), "36×");
});

test("the gallery pile grows with the copies but stops at two edges", () => {
  assert.equal(pileEdges(1), 0);
  assert.equal(pileEdges(2), 1);
  assert.equal(pileEdges(3), 2);
  assert.equal(pileEdges(36), 2);
});

test("copies are spoken in the singular and the plural", () => {
  assert.equal(copiesSpoken(1), "1 copy");
  assert.equal(copiesSpoken(4), "4 copies");
});
