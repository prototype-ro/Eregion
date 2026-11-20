import { test } from "node:test";
import assert from "node:assert/strict";
import { isBasicLand, ownedCopies, shoppingList } from "./collection.ts";
import type { DeckCardLine } from "./types";

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

test("the shopping list has what the deck still needs, priciest first, without the side boards", () => {
  const line = (name: string, board: string, quantity: number, owned: number, priceUsd: number | null) =>
    ({ name, board, quantity, owned, priceUsd }) as unknown as DeckCardLine;
  const list = shoppingList([
    line("Sol Ring", "main", 1, 0, 2),
    line("Mana Crypt", "main", 1, 0, 180),
    line("Island", "main", 10, 10, 0.1),
    line("Cultivate", "maybe", 1, 0, 1),
    line("Lightning Bolt", "main", 2, 1, null),
  ]);
  assert.deepEqual(list.map((need) => `${need.copies} ${need.name}`), ["1 Mana Crypt", "1 Sol Ring", "1 Lightning Bolt"]);
});
