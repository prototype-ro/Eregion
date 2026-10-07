import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHistory, describeChange } from "./history.ts";
import type { Board, CardAppearance, Timeline, VersionSummary } from "./types";

const app = (versionNumber: number, board: Board, quantity = 1, printing = "c21 263", tags: string[] = []): CardAppearance => ({ versionNumber, board, quantity, printing, tags });
const v = (versionNumber: number, parentVersion: number | null): VersionSummary => ({
  versionNumber, note: "", createdAt: "", cardCount: 0, averageManaValue: 0, branchId: "", parentVersion, mergeParent: null, added: 0, removed: 0,
});
const timeline: Timeline = {
  branches: [
    { id: "m", name: "main", forkedFromVersion: null, main: true, versions: [v(1, null), v(2, 1), v(4, 2)] },
    { id: "a", name: "alt", forkedFromVersion: 1, main: false, versions: [v(3, 1)] },
  ],
};

test("a card that appears is added", () => {
  assert.deepEqual(describeChange([], [app(2, "main")]), ["added to the mainboard"]);
});

test("a card that disappears is removed", () => {
  assert.deepEqual(describeChange([app(1, "main")], []), ["removed from the mainboard"]);
});

test("changing the copies is reported", () => {
  assert.deepEqual(describeChange([app(1, "main", 1)], [app(2, "main", 3)]), ["1 copy to 3 copies"]);
});

test("moving to another board with the same count is a move", () => {
  assert.deepEqual(describeChange([app(1, "main")], [app(2, "maybe")]), ["moved from the mainboard to the maybeboard"]);
});

test("printing and tag changes are reported, tag case is ignored", () => {
  assert.deepEqual(describeChange([app(1, "main", 1, "c21 263", ["Ramp"])], [app(2, "main", 1, "ltc 319", ["ramp"])]), ["printing C21 263 to LTC 319"]);
  assert.deepEqual(describeChange([app(1, "main", 1, "x 1", ["Ramp"])], [app(2, "main", 1, "x 1", ["Ramp", "Fast"])]), ["tags changed"]);
});

test("nothing changed means no changes", () => {
  assert.deepEqual(describeChange([app(1, "main")], [app(2, "main")]), []);
});

test("history follows each version's own parent, across branches", () => {
  // Card in v1 and v2 (2 copies), dropped on alt (v3), and v4 on main keeps it.
  const history = buildHistory(timeline, [app(1, "main"), app(2, "main", 2), app(4, "main", 2)]);

  assert.deepEqual(history.events.map((e) => [e.version, e.branch, e.changes]), [
    [3, "alt", ["removed from the mainboard"]],
    [2, "main", ["1 copy to 2 copies"]],
    [1, "main", ["added to the mainboard"]],
  ]);
  assert.equal(history.versionsWith, 3);
  assert.equal(history.versionsTotal, 4);
  assert.equal(history.firstAdded, 1);
});

test("a card that was never in the deck has no history", () => {
  const history = buildHistory(timeline, []);

  assert.deepEqual(history.events, []);
  assert.equal(history.firstAdded, null);
});
