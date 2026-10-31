import assert from "node:assert/strict";
import { test } from "node:test";
import { blankCharacter, blankColor, blankGroup, changedSections, emptyLoreDoc, newLoreId, sectionDigests, trimLoreDoc } from "./lore.ts";
import type { LoreDoc } from "./types.ts";

test("new ids are unique and never empty", () => {
  const a = newLoreId();
  const b = newLoreId();
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test("blank items carry fresh ids", () => {
  assert.ok(blankGroup().id.length > 0);
  assert.ok(blankColor().id.length > 0);
  assert.ok(blankCharacter().id.length > 0);
});

test("trimLoreDoc drops blank rows and trims every field", () => {
  const doc: LoreDoc = {
    cosmology: { overview: "  Aelar wove the first threads ", forces: ["Thin", "  ", ""] },
    groups: [
      { id: "1", name: "  Unfallen ", description: " d ", traits: " v " },
      { id: "2", name: "   ", description: "x", traits: "y" },
    ],
    tales: ["  the first weaving  ", "  ", ""],
    colors: [
      { id: "3", faction: "  ", color: " violet ", meaning: " void " },
      { id: "4", faction: "", color: "", meaning: "" },
    ],
    characters: [
      { id: "5", name: " Sildarion ", group: " Unfallen ", race: " spirit ", role: " sentinel ", signature: " gold coin " },
      { id: "6", name: " ", group: "t", race: "r", role: "o", signature: "s" },
    ],
    naming: "  -ion suffix  ",
    gaps: ["  an untested group  ", ""],
    canonSource: "  ",
  };

  const clean = trimLoreDoc(doc);

  assert.equal(clean.cosmology.overview, "Aelar wove the first threads");
  assert.deepEqual(clean.cosmology.forces, ["Thin"]);
  assert.equal(clean.groups.length, 1);
  assert.equal(clean.groups[0].name, "Unfallen");
  assert.deepEqual(clean.tales, ["the first weaving"]);
  assert.equal(clean.colors.length, 1);
  assert.equal(clean.colors[0].color, "violet");
  assert.equal(clean.characters.length, 1);
  assert.equal(clean.characters[0].name, "Sildarion");
  assert.equal(clean.characters[0].group, "Unfallen");
  assert.equal(clean.naming, "-ion suffix");
  assert.deepEqual(clean.gaps, ["an untested group"]);
  assert.equal(clean.canonSource, null);
});

test("an empty doc starts with an empty cosmology and no lists", () => {
  const doc = emptyLoreDoc();
  assert.deepEqual(doc.cosmology, { overview: "", forces: [] });
  assert.deepEqual(doc.groups, []);
  assert.deepEqual(doc.tales, []);
  assert.deepEqual(doc.colors, []);
  assert.deepEqual(doc.characters, []);
  assert.deepEqual(doc.gaps, []);
  assert.equal(doc.canonSource, null);
});

test("sectionDigests ignores ids but catches content changes", () => {
  const a: LoreDoc = { ...emptyLoreDoc(), groups: [{ id: "1", name: "Unfallen", description: "d", traits: "v" }] };
  const b: LoreDoc = { ...emptyLoreDoc(), groups: [{ id: "2", name: "Unfallen", description: "d", traits: "v" }] };
  const c: LoreDoc = { ...emptyLoreDoc(), groups: [{ id: "2", name: "Changed", description: "d", traits: "v" }] };

  assert.equal(sectionDigests(a).groups, sectionDigests(b).groups);
  assert.notEqual(sectionDigests(a).groups, sectionDigests(c).groups);
});

test("changedSections reports only the sections whose digest moved", () => {
  const before = sectionDigests(emptyLoreDoc());
  const after = sectionDigests({ ...emptyLoreDoc(), naming: "new convention" });

  const changed = changedSections(before, after);

  assert.deepEqual([...changed], ["naming"]);
});

test("changedSections flags the cosmology tile when canonSource changes", () => {
  const before = sectionDigests(emptyLoreDoc());
  const after = sectionDigests({ ...emptyLoreDoc(), canonSource: "Marvel Comics" });

  assert.deepEqual([...changedSections(before, after)], ["cosmology"]);
});
