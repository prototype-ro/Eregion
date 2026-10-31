import assert from "node:assert/strict";
import { test } from "node:test";
import { blankCharacter, blankColor, blankTier, emptyLoreDoc, newLoreId, trimLoreDoc } from "./lore.ts";
import type { LoreDoc } from "./types.ts";

test("new ids are unique and never empty", () => {
  const a = newLoreId();
  const b = newLoreId();
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test("blank items carry fresh ids", () => {
  assert.ok(blankTier().id.length > 0);
  assert.equal(blankTier("ERASURE").mechanism, "ERASURE");
  assert.ok(blankColor().id.length > 0);
  assert.ok(blankCharacter().id.length > 0);
});

test("trimLoreDoc drops blank rows and trims every field", () => {
  const doc: LoreDoc = {
    cosmology: { maker: "  Aelar ", spirits: ["Thin", "  ", ""], corruptor: " " },
    tiers: [
      { id: "1", name: "  Unfallen ", definition: " d ", mechanism: "ADDITION", vocabulary: " v " },
      { id: "2", name: "   ", definition: "x", mechanism: "ERASURE", vocabulary: "y" },
    ],
    colors: [
      { id: "3", faction: "  ", color: " violet ", meaning: " void " },
      { id: "4", faction: "", color: "", meaning: "" },
    ],
    characters: [
      { id: "5", name: " Sildarion ", tier: " Unfallen ", race: " spirit ", role: " sentinel ", signature: " gold coin " },
      { id: "6", name: " ", tier: "t", race: "r", role: "o", signature: "s" },
    ],
    naming: "  -ion suffix  ",
    gaps: ["  an untested tier  ", ""],
  };

  const clean = trimLoreDoc(doc);

  assert.equal(clean.cosmology.maker, "Aelar");
  assert.deepEqual(clean.cosmology.spirits, ["Thin"]);
  assert.equal(clean.cosmology.corruptor, "");
  assert.equal(clean.tiers.length, 1);
  assert.equal(clean.tiers[0].name, "Unfallen");
  assert.equal(clean.colors.length, 1);
  assert.equal(clean.colors[0].color, "violet");
  assert.equal(clean.characters.length, 1);
  assert.equal(clean.characters[0].name, "Sildarion");
  assert.equal(clean.naming, "-ion suffix");
  assert.deepEqual(clean.gaps, ["an untested tier"]);
});

test("an empty doc starts with an empty cosmology and no lists", () => {
  const doc = emptyLoreDoc();
  assert.deepEqual(doc.cosmology, { maker: "", spirits: [], corruptor: "" });
  assert.deepEqual(doc.tiers, []);
  assert.deepEqual(doc.colors, []);
  assert.deepEqual(doc.characters, []);
  assert.deepEqual(doc.gaps, []);
});
