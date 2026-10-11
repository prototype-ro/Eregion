import assert from "node:assert/strict";
import { test } from "node:test";
import { dominantHue } from "./artColor.ts";

/** An RGBA image of the given colours, one flat block of pixels per entry. */
const image = (blocks: Array<[number, number, number, number]>) => {
  const out: number[] = [];
  for (const [r, g, b, count] of blocks) for (let i = 0; i < count; i++) out.push(r, g, b, 255);
  return out;
};

test("picks the colour most of the art shares", () => {
  const found = dominantHue(image([[220, 40, 40, 800], [40, 60, 220, 200]]));
  assert.ok(found);
  assert.ok(found.hue < 15 || found.hue > 345, `expected red, got ${found.hue}`);
});

test("a small bright patch loses to a large one", () => {
  const found = dominantHue(image([[30, 200, 60, 900], [255, 0, 0, 100]]));
  assert.ok(found && found.hue > 100 && found.hue < 150, `expected green, got ${found?.hue}`);
});

test("ignores black, white and grey", () => {
  const found = dominantHue(image([[0, 0, 0, 2000], [255, 255, 255, 1000], [128, 128, 128, 1000], [30, 120, 220, 300]]));
  assert.ok(found && found.hue > 200 && found.hue < 225, `expected blue, got ${found?.hue}`);
});

test("gives nothing for art without colour", () => {
  assert.equal(dominantHue(image([[0, 0, 0, 3000], [90, 90, 90, 1000]])), null);
});

test("gives nothing when the colours are evenly mixed", () => {
  const spread = Array.from({ length: 12 }, (_, i) => {
    const h = (i * 30) / 60, x = 1 - Math.abs((h % 2) - 1);
    const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
    return [Math.round(r * 230 + 20), Math.round(g * 230 + 20), Math.round(b * 230 + 20), 100] as [number, number, number, number];
  });
  assert.equal(dominantHue(image(spread)), null);
});

test("wraps around red", () => {
  const found = dominantHue(image([[240, 20, 40, 500], [240, 30, 10, 500]]));
  assert.ok(found && (found.hue > 340 || found.hue < 20));
});
