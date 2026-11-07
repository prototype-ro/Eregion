# Deck builder workflow: design

Date: 2026-11-06. Status: draft for review.

## Goal

A structured, rules-based guided build: commander → plan → table context → role-slot targets → fill slots → mana base → curve → audit. The tool never scores synergy or "power" — every number it shows carries its source (a named benchmark range) and its assumption, and every suggestion is a question, never an instruction. The player always decides.

This replaces the earlier guided creator (already deleted, commit `f8c4de2`, nothing left to clean up), which tried to score card synergy in code. This approach is different: templates, role slots, benchmark bands, live audit, candidate search — no synergy math anywhere.

## What already exists (do not rebuild)

Eregion already has a full analysis engine in `io.eregion.analysis`, used today by the deck page's Statistics section (`StatsSection.tsx` → `useAnalysis` → `POST /api/analysis`). This design calls into it; it does not duplicate it:

- **Castability math**: `Hypergeometric.java` (the hypergeometric distribution itself), `ConsistencyCalculator.java` (opening-hand keep %, mana-source-by-turn, ramp-adjusted commander castability), `CompositionCalculator.java` (median mana value, pip demand, per-colour source production from lands and other cards).
- **Brackets**: `BracketClassifier.java` already classifies 1–5 with Game Changer count, mass land denial, extra-turn flags, and keeps the rules floor and the informational pace note separate, exactly as this design would otherwise ask for.
- **Combos**: `ComboService.java` + `SpellbookParser.java` already call Commander Spellbook's `find-my-combos`, drop combos needing an unowned template card, drop anything not Commander-legal, cache 6h, degrade to "unavailable" on an outage. Done, not a milestone.
- **Combo timing**: `BracketClassifier`/`GoldfishSimulator` already compute "combo available by turn 6" for the Bracket-3 floor.
- **Optional simulation**: `GoldfishSimulator.java`, `WinTurnEstimator.java`, `ArchenemyCalculator.java` — built, already labelled as estimates in their own doc comments.
- **Per-card roles, partially**: `functional-tags.json` (categories: Win Condition, Board Wipe, Counterspell, Removal, Ramp, Tutor, Card Draw, Protection, Recursion, Extra Combat, Stax, Tokens, Lifegain) + `FunctionalTagSyncService`/`FunctionalRules` assign a primary role per card from Scryfall Tagger data and regex rules, confidence-scored. No per-user override exists yet.
- **Charts**: `AnalysisBlocks.tsx`, `AnalysisOverview.tsx`, `StatsSection.tsx`, `stats/Composition.tsx`, `stats/HalftoneCurve.tsx`, `stats/ColourEclipses.tsx`, `stats/screen.tsx` (the bar/dot-meter primitives) — reused by the new workflow's relevant steps instead of new chart components.

Verified live against Scryfall (section 7 of the original brief): `game_changer` is a real top-level boolean on card objects (confirmed via `Demonic Tutor`); `oracle_cards` bulk data is what the catalog already loads from (this session). `BracketFlagSyncService` can switch from its `is:gamechanger` search to reading this field directly off the bulk catalog — small simplification, folded into milestone 1.

**Decision**: `DeckHealthCalculator`'s single 0–100 pillar score is retired everywhere (not just in the new workflow), replaced by Benchmark Profiles — matching the non-goal "no single deck-health number, only the breakdown."

## Non-goals

Same as the original brief: no synergy score, no "best card" ranking, no auto-complete, no win-turn prediction outside the already-existing, already-labelled estimate. No cuts proposed as instructions — only flags with a question.

## Data model

All new tables under `io.eregion.deck` (profiles/overrides are user-scoped, not deck-scoped) or a new `io.eregion.build` package for the workflow-specific pieces. Everything that needs to branch/diff is scoped by `deck_version_id`, so it rides the existing version/branch/diff machinery rather than inventing a parallel one — this is required by the brief's own acceptance tests (two branches of one build diffed on slot/stat/flag deltas) and by 6.8 ("every completed step creates a snapshot").

- `deck_plan` — `(deck_id, plan_text, archetype, bracket_target, pod_size, table_notes)`. One row per deck: this is context, not something you'd want two branches to disagree about structurally, though its text can change between versions like any other field.
- `benchmark_profile` — `(id, user_id, name, based_on \| null)`. Seeded on first use: "Upgraded (Bracket 3) Midrange", "Battlecruiser", "Casual (Bracket 2)" from the brief's own research digest. Duplicate-and-rename creates a new row with `based_on` set.
- `benchmark_range` — `(profile_id, category, min, max, source)`. `category` is one of: win_condition, ramp, card_advantage, card_selection, spot_removal, board_wipe, protection, recursion, lands, average_mana_value, plus any plan-specific theme the player names (free-text category for the 8x8 themes).
- `slot_target` — `(deck_version_id, role, target_min, target_max)`.
- `deck_card_slot` — `(deck_version_id, card_id, slot_role, pet_card boolean, cheat_in boolean)`. Additive metadata over the existing `deck_version_cards` row; a card not in this table simply isn't assigned to a slot yet (an open question, never an error, per the brief).
- `role_override` — `(user_id, card_id, role)`. Global per user, outranks the Tagger/regex pipeline, persists across decks and versions (the brief's own acceptance test).
- `saved_search` — `(user_id, deck_id, name, filter_json)`.

`functional-tags.json` gains the missing categories from the brief's taxonomy (Card Selection, Engine, Threat, Utility-or-hate); Land is not added as a tag — it already comes from `primary_type`, and every other place in the app treats lands that way, so the role system should not disagree with itself.

## Backend

New controllers/services, same pattern as the rest of `io.eregion.deck`/`io.eregion.card` (owner-only via `owned(deckId, userId)`, DTOs as records in one `*Dtos.java` per area):

- `DeckPlanController`/`Service` — plan CRUD under `/api/decks/{id}/plan`.
- `BenchmarkProfileController`/`Service` — profile + range CRUD under `/api/benchmark-profiles`, seeds the three defaults on first request for a new user.
- `RoleOverrideController`/`Service` — `/api/role-overrides/{cardId}` (PUT to set, DELETE to clear back to the automatic role).
- `SlotAuditService` — the piece that ties it together. Given a deck version + a benchmark profile: counts cards per role (override, else Tagger/regex primary role, else Uncategorized), compares to `slot_target`, calls the existing `ConsistencyCalculator`/`CompositionCalculator` for castability and colour sources, and produces a list of flags in the brief's exact format (metric, benchmark + source, a question). `GET /api/decks/{id}/versions/{v}/audit?profile={id}`.
- Candidate finder extends the existing `CardController` search (already fixed this session: word-based local match, bulk catalog) with: role, owned-in-collection (and copy count), Game Changer, price range, legal-in-commander. New param `previewAgainst={deckVersionId}&profile={id}`: for each result, runs `SlotAuditService` with that one card hypothetically added and returns the delta (role count, average mana value, colour-source counts, Game Changer count) alongside the result — no new scoring, the same deterministic calculators run twice and diffed.
- `GET /api/decks/{id}/audit-diff?from={v1}&to={v2}` — slot/benchmark/flag deltas (new vs resolved), next to the card-level diff the version system already has.

## Frontend

- New route `/decks/[id]/build`, a step sidebar (the 8 steps), reusing `AnalysisBlocks`/`stats/*` for every bar/chart rather than new chart components.
- Two entry points converge on the same step UI and the same draft state: "Start a build" (blank draft, commander pick first) from the decks list, and a "Build" button on an existing deck's page (preloads the current version's cards into `deck_card_slot`/`slot_target` so the step flow picks up where the free-form list left off). Both save through the exact same per-step-is-a-version-save path as the regular builder — there is one persistence model, not two.
- Step 5 (fill slots) embeds the new candidate finder, scoped to the open slot's role.
- Step 6 (mana base) embeds `CompositionCalculator`'s colour-source table plus the profile's land-count band as an overlay, not new math.
- Step 8 (audit) reuses `BracketClassifier`/`ComboService` output as-is (`AnalysisBlocks`), adds the new slot/benchmark flags from `SlotAuditService`, and surfaces `GoldfishSimulator`/`WinTurnEstimator` labelled exactly as they already are ("an estimate, not a prediction").
- The free-form card-list page gains a visible link to "Build" so neither view is a dead end relative to the other.

## Errors

- A benchmark profile with no ranges for a category the audit needs: that category is simply not flagged (an open question is better than a false "within range"), not an error.
- `SlotAuditService` failing to reach the existing analysis pieces degrades the same way `StatsSection` already does today (marked unavailable, retry), not a hard failure of the whole audit.
- Candidate-finder preview failing for one card (a malformed printing, a missing oracle text) shows that one result without a preview line rather than failing the whole search.

## Testing

Backend:

- `SlotAuditService`: role counting with an override present vs absent; a flag's wording includes the metric, the band, and the source; a category with no ranges produces no flag.
- Candidate-finder preview: adding a card changes only the metrics it should (the brief's own acceptance test).
- `role_override` persists across two different decks and two versions of the same deck.
- `functional-tags.json`'s new categories parse and classify against known oracle text, same pattern as the existing `FunctionalRules` tests.
- `BracketFlagSyncService` reading `game_changer` straight off the bulk catalog matches what the existing `is:gamechanger` search produces, for a sample of known Game Changers.

Frontend:

- Step-sidebar state and the two entry points converging on the same draft shape.
- Slot target bars (`current / target`) against known inputs.
- Audit-diff rendering for slot/flag deltas, pure logic like the existing `src/lib/*.test.ts` files.

Fixture: `Kaalia_current_fixture.txt` (Kaalia of the Vast, Mardu Angels/Demons/Dragons cheat-in, Bracket 3, pod of 4) drives the acceptance tests already listed in the original brief's section 10 — carried over unchanged, since nothing about the re-scoping invalidates them.

## Open details to settle in the plan

- Exact wording/category list for the extended `functional-tags.json` taxonomy (Card Selection vs Card Draw boundary, what "Threat" catches that Win Condition doesn't).
- Whether `deck_plan.bracket_target` and the existing deck-level bracket shown elsewhere in the app should be the same field or two (today's bracket reading is computed by `BracketClassifier`, not set by the player — this is a new, player-set target to audit against, likely needs its own column, but worth confirming no existing field already serves this).
- Default profile ranges: transcribe the brief's section 4 numbers exactly, or round to cleaner bands — a judgement call for the plan, not the design.
- Whether `DeckHealthCalculator`'s removal needs a migration step (anyone depending on its stored output, if it stores anything, vs. being purely computed on demand — check before deleting).
