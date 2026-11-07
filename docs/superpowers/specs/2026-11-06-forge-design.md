# Forge: the deck building hub and engine — design

Date: 2026-11-06. Status: draft for review. Supersedes milestones 2–8 of `2026-11-06-deck-builder-workflow-design.md` (milestone 1 — deck plan, benchmark profiles, role overrides — is built and kept; Forge consumes it).

## Goal

A high-end Commander deck builder, Bracket 3 first, that works as a hub: start a deck from a commander, improve an existing deck, or import a list and improve it. The player sets the parameters; the engine builds a highly synergistic, legal, well-proportioned deck and explains every pick. It serves a new player (guided, explained) and an experienced builder (dense, fast, every choice overridable) with one interface.

It is not a suggestion list. It is a generator plus a doctor: it profiles the commander, gathers candidates from the whole local card pool, scores them with visible reasons, fills role slots to benchmark targets, optimises the 99 under Commander and Bracket rules, and proposes swaps on existing decks with their stat impact.

## Principles

- **Commander rules and Bracket rules are hard constraints**, never scores: colour identity, singleton, legality, ≤3 Game Changers and no two-card combos before turn 6 and no mass land denial and no chained extra turns at Bracket 3.
- **Every pick carries its reasons.** A score is a sum of named parts; the top three show on the card. No hidden number.
- **Deterministic and offline.** Same inputs, same deck (seeded). The engine runs on the local catalog; no per-query external calls in the build loop.
- **The player decides.** Generated cards are proposals until accepted; locked cards are never touched; every accepted batch is a version.
- **No language model picks cards.** An LLM may later phrase explanations; it never chooses.

## Data sources (decided)

| Source | Use | Status |
|---|---|---|
| Local catalog (Scryfall `oracle_cards` bulk, ~39k cards) | the candidate pool | built (commit 8b646b5) |
| Scryfall `edhrec_rank` | global popularity prior — how widely played a card is in Commander overall | add: a nullable `edhrec_rank INT` column on `cards`, filled by the mapper from the same bulk file |
| Scryfall `oracle_tags` bulk (~6 MB, official) | what each card does (sac-outlet, token-maker, death-trigger, …) for synergy matching and "any set" search | add: `card_oracle_tags (card_id, tag)` loaded alongside the bulk catalog |
| Commander Spellbook | combos in/one card from the deck; already integrated (`ComboService`) | built; reuse |
| Eregion's own decks | per-commander co-occurrence ("what other players here run with this commander") | later milestone; shown only above a deck-count threshold, with the count |
| EDHREC | — | not used: its terms forbid automated access and "similar or competitive" sites. Revisit only with written permission. |

`edhrec_rank` is global, not per commander. It is a guardrail that keeps strong staples from losing to weak on-theme cards, weighted lightly; per-commander popularity comes from Eregion's own decks once there are enough.

## Engine — package `io.eregion.forge`

Built on the existing analysis code: `deck-themes.json`/`EngineClassifier` (15 themes + tribal), the functional-tag roles with milestone-1 overrides, `ComboService`, `BracketClassifier`, `CompositionCalculator`, `ConsistencyCalculator`, `Hypergeometric`, `GoldfishSimulator`, benchmark profiles.

### 1. `CommanderProfiler`

Reads the commander's (and partner's/background's) oracle text and tags:
- theme weights, from the same rules `deck-themes.json` uses for a whole deck;
- **hooks**: what the commander triggers on or pays off — attacks, deaths, casting instants, ETBs, counters, tokens, a named tribe, graveyard, life;
- colours, mana value, primary role.

Output `CommanderProfile{themes, hooks[], tribe?, colors, manaValue}`. Shown to the player in the parameter step, editable (confirm/remove hooks, pick strategy). The plan's archetype tag, when set, wins.

### 2. `CandidatePool`

Within colour identity, Commander-legal, budget, owned filter, set include/exclude, minus bans:
1. hook matches (fuels or pays off a commander hook) — via oracle tags and regex;
2. theme matches;
3. role staples — best `edhrec_rank` per role in the colour identity;
4. Spellbook combos with the commander or seed cards, Bracket-filtered.
Each candidate records where it came from. Cap ~600.

### 3. `SynergyScorer`

`score = Σ wᵢ·fᵢ − penalties`, each term stored as `Reason{label, value, source}`:
- `hook` — directly fuels/pays off a commander hook (largest weight);
- `theme` — overlap with the commander's theme weights;
- `deck` — share of the current deck it connects to (shared tags), recomputed as the deck changes, so synergy compounds;
- `combo` — completes a Bracket-legal combo;
- `popularity` — normalised `edhrec_rank` (weight ~0.15–0.25);
- `corpus` — per-commander lift from Eregion decks (0 until the threshold);
- penalties — above the curve target, off-plan, would break the Game Changer cap.
Common phrases are down-weighted (idf) so keyword soup doesn't win. Weights live in a resource file, tunable.

### 4. `DeckForge` — generate

1. Lock commander and any locked/pet cards. Land count from the profile's average-MV band.
2. For each role slot in priority order (win conditions, ramp, draw, spot removal, wipes, protection, then theme slots), take the best-scoring card of that role; re-score after each pick.
3. Fill flex slots by synergy.
4. Mana base: basics + duals/utility by pip demand (`CompositionCalculator`), checked by hypergeometric castability (90% default).
5. Local search: swap the weakest unlocked card for the best unused candidate of the same role while the objective rises (synergy + role-band fit + curve fit + castability), up to N iterations.
6. Hard constraints checked at every step. Final validation through `AnalysisService` (bracket, combos, consistency, goldfish estimate, labelled as an estimate).
7. Output: the 99 with per-card reasons, slot fill vs targets, audit flags. Saved as a version on a build branch.

### 5. `DeckDoctor` — improve

Scores every card in context of the rest; flags role bands outside their range and the weakest ~10% by contribution; for each, the top three same-role replacements with deltas (synergy, role counts, average MV, castability, Bracket). Nothing applies until accepted.

### 6. Any-set search

`GET /api/forge/search` — the deck's tag profile matched against any set (or all sets), filters for set, type, MV, colour, owned, price, Game Changer; results ranked by the same scorer with reasons and a stat-impact preview. This is the "check any set for cards that fit" feature and the same candidate source the workspace uses.

## API

- `POST /api/forge/profile` — commander(s) → `CommanderProfile`.
- `POST /api/forge/build` — parameters → a new deck (or a build branch on an existing deck) with reasons; async job if slow, polled.
- `POST /api/decks/{id}/forge/doctor` — weakest cards, slot gaps, swap proposals with deltas.
- `POST /api/decks/{id}/forge/suggest?role=…` — candidates for one slot, scored, with reasons and deltas.
- `GET /api/forge/search` — any-set search.
Parameters: commander(s), bracket (default 3), strategy/hooks, budget (per card / total), owned (any/first/only), sets include/exclude, pets, bans, land override, benchmark profile.

## Frontend — the hub

- `/build` — hub: **New from commander**, **Improve a deck** (your decks with bracket chip), **Import a list then improve**; recent builds.
- Parameter screen, one page, progressive disclosure: commander, bracket, strategy chips (from the profile), budget always shown; "More" holds owned, sets, pets, bans, lands, profile. Same fields for everyone; a Guided/Pro toggle changes density and explanation, not the flow.
- `/build/[deckId]` — workspace: left rail of slot bars (target bands from the profile) + Bracket status (Game Changers n/3, combo timing); centre the deck (reusing `CardViews`) with per-card source (kept / suggested / locked / yours); right the suggestions for the active slot with score, reasons, deltas and Add / Swap / Lock / Never. Top: Generate, Regenerate unlocked. Bottom: compact Statistics blocks, live.
- Deck page: an **Improve** button opens the workspace; builds live on their own branch in the version timeline, so diff and merge already work.
- Look decided in a `/dev` lab first (slot bars as the HUD element), per the project's UI process.

## Milestones

1. **Data**: `edhrec_rank` column + mapper; `oracle_tags` bulk load into `card_oracle_tags`; tests.
2. **Profiler + scorer** with reasons; unit tests on real commanders (Kaalia, Sauron, Rhys).
3. **Doctor** (improve mode) — smallest shippable win: API + workspace right-panel for an existing deck.
4. **Generator** (`DeckForge`) + build API + hub/new-deck flow.
5. **Any-set search** endpoint + UI.
6. **Own co-occurrence stats** (nightly, thresholded) feeding the `corpus` term.
Each milestone: plan, review, ship, before the next.

## Testing and acceptance

- Kaalia of the Vast fixture (B3, Angels/Demons/Dragons cheat-in): profiler finds attack + creature-type hooks; generator output is legal, 100 cards, ≤3 GC, no early two-card combo, role bands within the Upgraded B3 profile; every card has ≥1 reason.
- Determinism: same seed and inputs → identical 99.
- Doctor on the real Kaalia deck proposes swaps whose deltas match a recomputation.
- No-popularity mode (`edhrec_rank` absent) still builds a legal, on-theme deck.

## Open questions

- Weights: start values and how to tune them (a small `/dev` lab to adjust and compare generated decks side by side is the likely answer).
- Async build: how long a full generate takes on real data; whether a job queue is needed or a single request is enough.
- Budget: card prices come from the per-card `price_usd` already stored; whether "owned" means the collection feature's data.
