import assert from "node:assert/strict";
import { test } from "node:test";
import { canApplyInPlace } from "./versions.ts";
import type { Timeline, VersionSummary } from "./types";

const v = (versionNumber: number, parentVersion: number | null, mergeParent: number | null = null): VersionSummary => ({
  versionNumber, note: "", createdAt: "", cardCount: 0, averageManaValue: 0, branchId: "", parentVersion, mergeParent, added: 0, removed: 0,
});

const timeline: Timeline = {
  branches: [
    { id: "m", name: "main", forkedFromVersion: null, main: true, versions: [v(1, null), v(2, 1), v(5, 2, 4)] },
    { id: "a", name: "alt", forkedFromVersion: 1, main: false, versions: [v(3, 1)] },
    { id: "b", name: "other", forkedFromVersion: 2, main: false, versions: [v(4, 2)] },
  ],
};

test("a version nothing grew from can be changed", () => {
  assert.deepEqual(canApplyInPlace(timeline, 5), { ok: true, reason: null });
  assert.deepEqual(canApplyInPlace({ branches: [{ id: "m", name: "main", forkedFromVersion: null, main: true, versions: [v(1, null)] }] }, 1).ok, true);
});

test("a version with a later version on its branch cannot", () => {
  const check = canApplyInPlace(timeline, 1);
  assert.equal(check.ok, false);
  assert.match(check.reason ?? "", /grew from this one|split off/);
});

test("a version another branch split from cannot", () => {
  const check = canApplyInPlace(timeline, 2);
  assert.equal(check.ok, false);
});

test("a version that a merge brought in cannot", () => {
  const check = canApplyInPlace(timeline, 4);
  assert.equal(check.ok, false);
  assert.match(check.reason ?? "", /merged this one in/);
});

test("the tip of a side branch can be changed", () => {
  assert.equal(canApplyInPlace({ branches: [{ id: "m", name: "main", forkedFromVersion: null, main: true, versions: [v(1, null)] }, { id: "a", name: "alt", forkedFromVersion: 1, main: false, versions: [v(2, 1)] }] }, 2).ok, true);
});
