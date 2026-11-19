import assert from "node:assert/strict";
import { test } from "node:test";
import { tierOptions } from "./proxyTiers.ts";
import type { LoreDoc, LoreGroup } from "./types.ts";

const group = (name: string, traits: string): LoreGroup => ({ id: name, name, description: "", traits });
const doc = (groups: LoreGroup[]): LoreDoc => ({
  cosmology: { overview: "", forces: [] },
  groups,
  tales: [],
  colors: [],
  characters: [],
  naming: "",
  gaps: [],
  canonSource: null,
});

test("the groups that name a dragon form are the tiers, labelled with it", () => {
  const options = tierOptions(
    doc([
      group("Lathaar-tier", "Dragons: the Unfallen Warden \u2014 pale white and gold."),
      group("Mid-transformation", "Dragons have no mid-transformation tier."),
      group("Aelathir-tier", "Addition/mutation, never facelessness Dragons: the Hoard-lord \u2014 darker hide."),
      group("Maelgrith-submitted", "Erasure Dragons: the Unkept \u2014 desaturated gray."),
      group("Coil (Memory Hold)", "Long wingless serpent."),
    ]),
  );
  assert.deepEqual(options, [
    { value: "Lathaar-tier", label: "Unfallen Warden (Lathaar-tier)" },
    { value: "Aelathir-tier", label: "Hoard-lord (Aelathir-tier)" },
    { value: "Maelgrith-submitted", label: "Unkept (Maelgrith-submitted)" },
  ]);
});

test("a hyphen inside a dragon form does not cut it short", () => {
  const [option] = tierOptions(doc([group("Aelathir-tier", "Dragons: the Hoard-lord \u2014 darker hide.")]));
  assert.equal(option.label, "Hoard-lord (Aelathir-tier)");
});

test("without dragon forms the groups whose name says tier are offered by name", () => {
  const options = tierOptions(doc([group("Gondor", "stewards"), group("Lathaar-tier", ""), group("Mid-transformation", "")]));
  assert.deepEqual(options, [
    { value: "Lathaar-tier", label: "Lathaar-tier" },
    { value: "Mid-transformation", label: "Mid-transformation" },
  ]);
});

test("a lore with no groups, or none at all, offers nothing", () => {
  assert.deepEqual(tierOptions(doc([])), []);
  assert.deepEqual(tierOptions(null), []);
  assert.deepEqual(tierOptions(undefined), []);
});
