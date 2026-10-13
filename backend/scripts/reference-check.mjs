#!/usr/bin/env node
// Runs the reference decks in docs/analysis-references.json through a running API and compares each estimated win turn with its pinned value
// and with the turn the other site showed. Exits 1 when an estimate has moved from its pin by more than the tolerance.
//
//   node backend/scripts/reference-check.mjs [apiUrl]      (default http://localhost:8080)
//
// It needs the dev database in docker (container eregion-db) to read the saved card lists, and it makes a throwaway account that it deletes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const api = process.argv[2] ?? "http://localhost:8080";
const here = dirname(fileURLToPath(import.meta.url));
const references = JSON.parse(readFileSync(join(here, "../../docs/analysis-references.json"), "utf8"));
const origin = process.env.EREGION_ORIGIN ?? "http://localhost:3000";
const email = `reference-check-${Date.now()}@example.test`;
const password = "violet-lantern-seventeen";

const sql = (query) => execFileSync("docker", ["exec", "eregion-db", "psql", "-U", "eregion", "-d", "eregion", "-tAc", query], { encoding: "utf8" }).trim();
const cardsOf = (version) =>
  JSON.parse(
    sql(`select json_build_object('cards', json_agg(json_build_object('cardId',card_id,'board',board,'quantity',quantity))) from deck_version_cards where version_id='${version}' and board in ('commander','main')`),
  );

let cookie = "";
async function call(path, body) {
  const response = await fetch(api + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  return response;
}

await call("/api/auth/register", { email, password, displayName: "reference" });
await call("/api/auth/login", { email, password });
let failed = false;
console.log("deck".padEnd(30), "ours".padStart(5), "pinned".padStart(7), "other site".padStart(11), "gap".padStart(6), "  bracket");
try {
  for (const deck of references.decks) {
    const response = await call("/api/analysis", cardsOf(deck.version));
    if (!response.ok) {
      console.log(deck.name.padEnd(30), `request failed: ${response.status}`);
      failed = true;
      continue;
    }
    const analysis = await response.json();
    const ours = analysis.winTurn.turn;
    const moved = deck.pinned !== null && Math.abs(ours - deck.pinned) > references.tolerance;
    const gap = deck.otherSite === null ? "" : (ours - deck.otherSite).toFixed(1);
    if (moved) failed = true;
    console.log(
      deck.name.padEnd(30),
      ours.toFixed(1).padStart(5),
      (deck.pinned === null ? "-" : deck.pinned.toFixed(1)).padStart(7),
      (deck.otherSite === null ? "-" : deck.otherSite.toFixed(1)).padStart(11),
      gap.padStart(6),
      `  B${analysis.bracket.bracket}${moved ? "   <-- MOVED from its pin" : ""}`,
    );
  }
} finally {
  await call("/api/account/delete", { password });
}
if (failed) {
  console.error("\nAn estimate moved away from its pinned value. If that is intended, update 'pinned' in docs/analysis-references.json in the same commit.");
  process.exit(1);
}
console.log("\nAll pinned estimates hold.");
