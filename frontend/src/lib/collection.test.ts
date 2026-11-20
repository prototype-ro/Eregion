import { test } from "node:test";
import assert from "node:assert/strict";
import { isBasicLand, ownedCopies } from "./collection.ts";

test("basic lands, snow basics and Wastes are basic", () => {
  assert.equal(isBasicLand("Basic Land — Mountain"), true);
  assert.equal(isBasicLand("Basic Snow Land — Island"), true);
  assert.equal(isBasicLand("Basic Land"), true);
  assert.equal(isBasicLand("Land — Mountain Forest"), false);
  assert.equal(isBasicLand("Legendary Land"), false);
  assert.equal(isBasicLand(null), false);
});

test("basic lands always count as owned, other cards use the collection", () => {
  const collection = new Map([["sol", 1]]);
  assert.equal(ownedCopies({ cardId: "mountain", typeLine: "Basic Land — Mountain", quantity: 30 }, collection), 30);
  assert.equal(ownedCopies({ cardId: "sol", typeLine: "Artifact", quantity: 1 }, collection), 1);
  assert.equal(ownedCopies({ cardId: "bolt", typeLine: "Instant", quantity: 1 }, collection), 0);
});
