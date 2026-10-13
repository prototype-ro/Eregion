#!/usr/bin/env node
// Checks the analysis against brackets that deck owners chose themselves. It takes the most viewed public Commander decks that Archidekt's
// owners tagged with a bracket, runs each through a running Eregion API, and reports how often our bracket and estimated win turn agree
// with the owner's tag and the turn range of that bracket (1: 10+, 2: 8 to 10, 3: 6 to 8, 4: 4 to 6, 5: under 4).
//
//   node backend/scripts/archidekt-compare.mjs [apiUrl] [--bracket 3] [--count 10] [--out file.json] [--other-site sheet.csv]
//   node backend/scripts/archidekt-compare.mjs --export dir [--bracket 3] [--count 10]
//
// --export writes each deck as a paste-ready text list plus an empty other-site.csv, and stops (it needs no API). Enter the lists on another
// site by hand, type the turn and bracket it shows into the csv, and pass that file as --other-site to see the gap next to ours.
// It makes one search request and one request per deck to Archidekt, a second apart, and creates a throwaway account on the API that it
// deletes. New cards are imported into the catalog (normal use of the app); a card's role comes from Scryfall's tags only after the daily
// tag sync, so on a catalog that has not seen these cards run it, sync, then run it again. It does not touch any other site.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const api = args.find((arg) => /^https?:/.test(arg)) ?? "http://localhost:8080";
const bracket = Number(flag("bracket", "3"));
const count = Number(flag("count", "10"));
const out = flag("out", null);
const exportDir = flag("export", null);
const otherSite = flag("other-site", null);
const origin = process.env.EREGION_ORIGIN ?? "http://localhost:3000";
const agent = "Eregion-dev/0.1 (comparing the deck analysis with owner-assigned brackets)";
const RANGES = { 1: "10+", 2: "8 to 10", 3: "6 to 8", 4: "4 to 6", 5: "under 4" };
const bracketOfTurn = (turn) => (turn >= 10 ? 1 : turn >= 8 ? 2 : turn >= 6 ? 3 : turn >= 4 ? 4 : 5);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function archidekt(path) {
  const response = await fetch(`https://archidekt.com/api/${path}`, { headers: { "User-Agent": agent, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Archidekt answered ${response.status} for ${path}`);
  return response.json();
}

/** The cards that are part of the deck: not the maybeboard or sideboard, with the commander told apart. */
function listOf(deck) {
  const outside = new Set(deck.categories.filter((c) => !c.includedInDeck).map((c) => c.name));
  const wanted = new Map();
  for (const entry of deck.cards) {
    if ((entry.categories ?? []).some((name) => outside.has(name))) continue;
    const name = entry.card?.oracleCard?.name ?? entry.card?.displayName;
    if (!name) continue;
    const board = (entry.categories ?? []).includes("Commander") ? "commander" : "main";
    const key = `${board}|${name}`;
    wanted.set(key, (wanted.get(key) ?? 0) + entry.quantity);
  }
  return [...wanted].map(([key, quantity]) => ({ board: key.split("|")[0], name: key.slice(key.indexOf("|") + 1), quantity }));
}

let cookie = "";
async function call(path, body) {
  const response = await fetch(api + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  return response;
}

const search = await archidekt(`decks/v3/?deckFormat=3&edhBracket=${bracket}&orderBy=-viewCount&pageSize=${count}`);
const found = search.results.slice(0, count);
console.log(`Archidekt: ${found.length} most viewed public Commander decks tagged bracket ${bracket} (of ${search.count}).`);

if (exportDir) {
  mkdirSync(exportDir, { recursive: true });
  const sheet = ["archidekt_id,deck,otherSiteTurn,otherSiteBracket"];
  for (const summary of found) {
    await wait(1000);
    const list = listOf(await archidekt(`decks/${summary.id}/`));
    const text = ["Commander", ...list.filter((card) => card.board === "commander").map((card) => `${card.quantity} ${card.name}`), "", "Deck", ...list.filter((card) => card.board === "main").map((card) => `${card.quantity} ${card.name}`)].join("\n") + "\n";
    const slug = summary.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    writeFileSync(`${exportDir}/${summary.id}-${slug}.txt`, text);
    sheet.push(`${summary.id},"${summary.name.replace(/"/g, "")}",,`);
    console.log(`${summary.id}  ${summary.name}  (${list.reduce((sum, card) => sum + card.quantity, 0)} cards)`);
  }
  writeFileSync(`${exportDir}/other-site.csv`, sheet.join("\n") + "\n");
  console.log(`\nWrote ${found.length} lists and ${exportDir}/other-site.csv. Fill in the two empty columns, then run again with --other-site ${exportDir}/other-site.csv`);
  process.exit(0);
}

const theirs = new Map();
if (otherSite) {
  for (const line of readFileSync(otherSite, "utf8").split("\n").slice(1)) {
    // The deck name is quoted and may hold commas, so the row is read from both ends.
    const row = line.match(/^(\d+),(?:"(?:[^"]|"")*"|[^,]*),([^,]*),([^,]*)$/);
    if (!row) continue;
    const [, id, turn, rating] = row;
    if (turn.trim()) theirs.set(Number(id), { turn: Number(turn), bracket: rating.trim() ? Number(rating.replace(/\D/g, "")) : null });
  }
}

const email = `archidekt-compare-${Date.now()}@example.test`;
const password = "violet-lantern-seventeen";
await call("/api/auth/register", { email, password, displayName: "compare" });
await call("/api/auth/login", { email, password });

const rows = [];
try {
  for (const summary of found) {
    await wait(1000);
    const deck = await archidekt(`decks/${summary.id}/`);
    const list = listOf(deck);
    const names = [...new Set(list.map((card) => card.name))];
    const ids = new Map();
    const missing = [];
    for (let at = 0; at < names.length; at += 200) {
      const response = await call("/api/cards/resolve", { names: names.slice(at, at + 200) });
      if (!response.ok) throw new Error(`resolve answered ${response.status}`);
      const body = await response.json();
      body.matches.forEach((match) => ids.set(match.requested, match.card));
      missing.push(...body.notFound);
    }
    const cards = list.filter((card) => ids.has(card.name)).map((card) => ({ cardId: ids.get(card.name).id, board: card.board, quantity: Math.min(card.quantity, 99) }));
    const response = await call("/api/analysis", { cards });
    if (!response.ok) {
      rows.push({ id: summary.id, name: summary.name, error: `analysis answered ${response.status}` });
      continue;
    }
    const analysis = await response.json();
    rows.push({
      id: summary.id,
      name: summary.name,
      views: summary.viewCount,
      ownerBracket: deck.edhBracket,
      size: list.reduce((sum, card) => sum + card.quantity, 0),
      missing,
      ourBracket: analysis.bracket.bracket,
      floor: analysis.bracket.floor,
      speedBracket: analysis.bracket.estimated,
      winTurn: analysis.winTurn.turn,
      turnBracket: bracketOfTurn(analysis.winTurn.turn),
      basis: analysis.winTurn.basis,
      gameChangers: analysis.bracket.signals.gameChangers,
      combos: analysis.combos.available ? analysis.bracket.signals.twoCardCombos : null,
      otherSite: theirs.get(summary.id) ?? null,
    });
  }
} finally {
  await call("/api/account/delete", { password });
}

const good = rows.filter((row) => !row.error);
console.log("\n" + "deck".padEnd(44) + "owner".padStart(6) + "ours".padStart(6) + "floor".padStart(7) + "speed".padStart(7) + "turn".padStart(6) + "  range    GC");
for (const row of rows) {
  if (row.error) {
    console.log(row.name.slice(0, 43).padEnd(44) + `  ${row.error}`);
    continue;
  }
  console.log(
    row.name.slice(0, 43).padEnd(44) + `B${row.ownerBracket}`.padStart(6) + `B${row.ourBracket}`.padStart(6) + `B${row.floor}`.padStart(7) + `B${row.speedBracket}`.padStart(7) +
      row.winTurn.toFixed(1).padStart(6) + `  B${row.turnBracket} ${RANGES[row.turnBracket]}`.padEnd(14) + String(row.gameChangers).padStart(3) + (row.missing.length ? `   (${row.missing.length} cards not found)` : ""),
  );
}
const compared = good.filter((row) => row.otherSite);
if (compared.length) {
  console.log("\nAgainst the other site (turns typed in by hand):");
  console.log("deck".padEnd(44) + "ours".padStart(6) + "theirs".padStart(8) + "gap".padStart(6) + "  ours/theirs bracket");
  for (const row of compared) {
    console.log(
      row.name.slice(0, 43).padEnd(44) + row.winTurn.toFixed(1).padStart(6) + row.otherSite.turn.toFixed(1).padStart(8) + (row.winTurn - row.otherSite.turn).toFixed(1).padStart(6) +
        `  B${row.ourBracket} / ${row.otherSite.bracket === null ? "-" : "B" + row.otherSite.bracket}`,
    );
  }
  const gaps = compared.map((row) => row.winTurn - row.otherSite.turn);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  console.log(`Mean gap ${mean.toFixed(2)} turns (positive means we are later), largest ${Math.max(...gaps.map(Math.abs)).toFixed(1)}, ${compared.length} decks.`);
}
const same = good.filter((row) => row.ourBracket === row.ownerBracket).length;
const within = good.filter((row) => Math.abs(row.ourBracket - row.ownerBracket) <= 1).length;
const turnSame = good.filter((row) => row.turnBracket === row.ownerBracket).length;
const turns = good.map((row) => row.winTurn).sort((a, b) => a - b);
console.log(`\nOur bracket equals the owner's on ${same} of ${good.length}, within one bracket on ${within}.`);
console.log(`The estimated win turn falls in the owner's bracket range on ${turnSame} of ${good.length}. Turns ${turns[0]?.toFixed(1)} to ${turns.at(-1)?.toFixed(1)}, median ${turns[Math.floor(turns.length / 2)]?.toFixed(1)}.`);
console.log("\nA card imported by this run has no role until the next tag sync (tutors, ramp and so on come from Scryfall's tags). If the catalog grew a lot, sync the tags and run this again before reading the result.");
if (out) {
  writeFileSync(out, JSON.stringify({ source: "archidekt.com public decks, owner-assigned bracket", bracket, ranAt: new Date().toISOString(), rows }, null, 2) + "\n");
  console.log(`Saved ${out}`);
}
