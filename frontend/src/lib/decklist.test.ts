import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanName, parseDecklist } from "./decklist.ts";

test("a trailing Archidekt type tag is stripped along with the printing suffix", () => {
  assert.equal(cleanName("Academy Manufactor (mkc) 221 [Creature]"), "Academy Manufactor");
  assert.equal(cleanName("Sauron, the Dark Lord (ltr) 224 [Commander{top}]"), "Sauron, the Dark Lord");
  assert.equal(cleanName("Prosper, Tome-Bound (afc) 2 *F* [Creature]"), "Prosper, Tome-Bound");
  assert.equal(cleanName("Birgi, God of Storytelling // Harnfel, Horn of Bounty (khm) 123 [Creature]"), "Birgi, God of Storytelling // Harnfel, Horn of Bounty");
});

test("an Archidekt export line parses to the right quantity and name", () => {
  const { entries, ignored } = parseDecklist("10x Mountain (blb) 274 [Land]\n1x Sol Ring (mkc) 237 [Artifact]");
  assert.deepEqual(ignored, []);
  assert.deepEqual(entries, [
    { quantity: 10, name: "Mountain", board: "main" },
    { quantity: 1, name: "Sol Ring", board: "main" },
  ]);
});
