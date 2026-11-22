import assert from "node:assert/strict";
import { test } from "node:test";
import { DECK_TOUR, stepsToShow } from "./tour.ts";

test("steps whose target is not on the page are skipped", () => {
  const present = new Set(["search", "versions", "stats"]);
  assert.deepEqual(
    stepsToShow(DECK_TOUR, (target) => present.has(target)).map((step) => step.target),
    ["search", "versions", "stats"],
  );
});

test("the deck tour starts with adding cards and has no more than seven steps", () => {
  assert.equal(DECK_TOUR[0].target, "search");
  assert.ok(DECK_TOUR.length <= 7);
});
