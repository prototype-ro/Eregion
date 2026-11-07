# Deck Builder — Milestone 1: Data Model Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the data-model foundation for the deck builder workflow: deck plan storage, user-owned benchmark profiles (with three seeded defaults, sourced from the design spec's research digest), per-user role overrides, and three new functional-tag categories (Card Selection, Engine, Threat) — nothing else from the spec yet. This milestone produces working, independently-testable software: four new REST areas with full CRUD, backed by real Postgres tables, with no UI.

**Architecture:** A new backend package `io.eregion.build` (Controller/Service/Repository per concern, one shared `BuildDtos` file — the same three-file pattern every other feature area in this codebase already uses: see `io.eregion.proxy` for `DeckPlan`/`BenchmarkProfile`/`RoleOverride`'s nearest analogue, a deck-scoped feature living in its own package rather than growing `DeckController`). Three new frontend hooks mirroring `useProxies.ts`. One Flyway migration. Two resource-file edits.

**Tech Stack:** Spring Boot 4 / Java 25, `JdbcClient` (no ORM), Postgres via Flyway, Testcontainers-gated repository tests (`PostgresTest`), JUnit 5 + AssertJ. Next.js/TypeScript frontend, `node:test` for pure-logic tests only (these are thin hooks, not pure logic — no new frontend tests required, matching how `useProxies.ts`/`useLore.ts` have none).

**Design doc:** `docs/superpowers/specs/2026-11-06-deck-builder-workflow-design.md`

---

## Important scope note, settled during planning (read before Task 2)

The design spec's taxonomy (6.3) is close to the existing `functional-tags.json` categories but not identical — it also implies renaming "Card Draw" → "Card advantage", "Removal" → "Spot removal", "Stax" → "Utility or hate". **This plan does not rename any existing category.** Checking the blast radius first: those three exact strings are hardcoded in `DeckHealthCalculator.java` and `ArchenemyCalculator.java` (both live production code, the latter *not* scheduled for retirement), plus eight more files across both backend tests and frontend (`roles.ts`, `cardColor.ts`, several `/dev/*` lab mocks). Renaming them is real, cross-cutting, un-asked-for work far outside "add the data model and seed some profiles." Milestone 1 only *adds* three new categories (Card Selection, Engine, Threat); mapping the spec's renamed vocabulary onto the existing stored names is a `SlotAuditService` (Milestone 2) concern, where that mapping naturally belongs.

Also settled: the `game_changer` field read from Scryfall, and the `Card Selection`/`Engine`/`Threat` tag sources, were checked live against the real Scryfall API before writing the tasks below (see Task 2) — not guessed.

---

### Task 1: Migration — new tables

**Files:**
- Create: `backend/src/main/resources/db/migration/V29__build_workflow_foundation.sql`
- Test: `backend/src/test/java/io/eregion/build/BuildMigrationTest.java`

- [ ] **Step 1: Write the failing test**

```java
package io.eregion.build;

import static org.assertj.core.api.Assertions.assertThat;

import io.eregion.support.PostgresTest;
import org.junit.jupiter.api.Test;

/** The four new tables exist with the columns the repositories below depend on. */
class BuildMigrationTest extends PostgresTest {

	@Test
	void theFourNewTablesExist() {
		assertThat(tableExists("deck_plan")).isTrue();
		assertThat(tableExists("benchmark_profile")).isTrue();
		assertThat(tableExists("benchmark_range")).isTrue();
		assertThat(tableExists("role_override")).isTrue();
	}

	private static boolean tableExists(String name) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :name)")
				.param("name", name)
				.query(Boolean.class)
				.single();
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw -q -o test -Dtest=BuildMigrationTest`
Expected: FAIL — Flyway has no `V29` migration yet, so the tables don't exist and the assertions fail (or, if Docker isn't available locally, the test is skipped entirely by `@Testcontainers(disabledWithoutDocker = true)`; if so, start Docker and re-run before continuing).

- [ ] **Step 3: Write the migration**

```sql
-- Deck-level build context: free text plan, archetype, target bracket, pod size, table notes. One row per deck —
-- this is context the player writes once, not something a version branch would disagree about structurally.
CREATE TABLE deck_plan (
    deck_id         UUID PRIMARY KEY REFERENCES decks (id) ON DELETE CASCADE,
    plan_text       TEXT NOT NULL DEFAULT '',
    archetype       TEXT NOT NULL DEFAULT '',
    bracket_target  SMALLINT,
    pod_size        SMALLINT,
    table_notes     TEXT NOT NULL DEFAULT '',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT deck_plan_bracket_chk CHECK (bracket_target IS NULL OR bracket_target BETWEEN 1 AND 5),
    CONSTRAINT deck_plan_pod_chk CHECK (pod_size IS NULL OR pod_size BETWEEN 1 AND 12)
);

-- A named set of benchmark ranges a player can audit a deck against. Owned by one user; duplicating one for
-- editing creates a new row with based_on set, rather than versioning a profile in place.
CREATE TABLE benchmark_profile (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    based_on   UUID REFERENCES benchmark_profile (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX benchmark_profile_user_idx ON benchmark_profile (user_id);

-- One target range for one category of one profile, with the source the number came from, so the UI can always
-- say why a band is where it is. A profile need not have a range for every category: a missing one is an open
-- question later, never a false "within range".
CREATE TABLE benchmark_range (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES benchmark_profile (id) ON DELETE CASCADE,
    category   TEXT NOT NULL,
    min_value  NUMERIC(6,2) NOT NULL,
    max_value  NUMERIC(6,2) NOT NULL,
    source     TEXT NOT NULL,
    CONSTRAINT benchmark_range_unique UNIQUE (profile_id, category),
    CONSTRAINT benchmark_range_bounds_chk CHECK (max_value >= min_value)
);

-- A player's correction of a card's automatic role, outranking the Scryfall-Tagger/regex guess wherever it is
-- read. Global per user (not per deck or version): it persists across every deck, matching how a player corrects
-- the same mistake only once.
CREATE TABLE role_override (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    role    TEXT NOT NULL,
    PRIMARY KEY (user_id, card_id)
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./mvnw -q -o test -Dtest=BuildMigrationTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V29__build_workflow_foundation.sql backend/src/test/java/io/eregion/build/BuildMigrationTest.java
git commit -m "Add deck_plan, benchmark_profile/range and role_override tables"
```

---

### Task 2: `functional-tags.json` / `functional-rules.json` — three new categories

Verified live against Scryfall before writing this (not guessed): `otag:scry` (449 commander-legal cards), `otag:surveil` (322), `otag:fateseal` (17) are real Tagger tags. `otag:card-selection`, `otag:engine`, `otag:threat`, `otag:payoff`, `otag:value`, `otag:synergy` all 404 ("didn't match any cards" — Scryfall gives the same error for an unknown tag and a real tag with zero hits, so this isn't fully conclusive, but every *real* tag tried above the fold returned nonzero results while every guess for Engine/Threat failed across ten attempts). Given that, **Engine** and **Threat** ship with no Tagger tags at all — regex-only, honestly labelled — rather than a fabricated tag slug that would silently categorize nothing forever.

**Files:**
- Modify: `backend/src/main/resources/functional-tags.json`
- Modify: `backend/src/main/resources/functional-rules.json`
- Test: `backend/src/test/java/io/eregion/card/FunctionalTagMappingTest.java:36-45` (extend the existing "ships and lists every role once" test)
- Test: `backend/src/test/java/io/eregion/card/FunctionalRulesTest.java` (new test method)

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/io/eregion/card/FunctionalTagMappingTest.java`, inside the existing `theFileThatShipsLoadsAndListsEveryRoleOnce` test body (replace the single assertion line):

```java
	@Test
	void theFileThatShipsLoadsAndListsEveryRoleOnce() {
		List<String> names = FunctionalTagMapping.load().names();

		assertThat(names).contains("Ramp", "Removal", "Board Wipe", "Card Draw", "Card Selection", "Engine", "Threat")
				.doesNotHaveDuplicates();
	}
```

Add a new test method at the end of `backend/src/test/java/io/eregion/card/FunctionalRulesTest.java` (inside the existing `class FunctionalRulesTest` body, before its closing brace):

```java
	@Test
	void guessesCardSelectionAndEngineFromRulesText() {
		assertThat(rules.match("Scry 2, then draw a card.")).containsEntry("Card Selection", 0.6);
		assertThat(rules.match("Surveil 3.")).containsEntry("Card Selection", 0.6);
		assertThat(rules.match("At the beginning of your upkeep, you may draw a card.")).containsEntry("Engine", 0.4);
		assertThat(rules.match("Flying, lifelink")).isEmpty();
	}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw -q -o test -Dtest=FunctionalTagMappingTest,FunctionalRulesTest`
Expected: FAIL — `theFileThatShipsLoadsAndListsEveryRoleOnce` fails because "Card Selection"/"Engine"/"Threat" aren't in the shipped file yet; `guessesCardSelectionAndEngineFromRulesText` fails because no rule matches those texts yet.

- [ ] **Step 3: Add the three categories to `functional-tags.json`**

Read the current file first (`backend/src/main/resources/functional-tags.json`) to get its exact current `categories` array (reproduced from this session's own read, for reference — do not trust this plan's copy blindly if the file has moved on; diff against the live file):

```json
{ "name": "Win Condition", "tags": ["alternate-win-condition"] },
{ "name": "Board Wipe", "tags": ["board-wipe"] },
{ "name": "Counterspell", "tags": ["counterspell"] },
{ "name": "Removal", "tags": ["removal"] },
{ "name": "Ramp", "tags": ["ramp", "mana-rock", "mana-dork", "land-ramp"] },
{ "name": "Tutor", "tags": ["tutor"] },
{ "name": "Card Draw", "tags": ["draw", "cantrip", "impulse-draw"] },
{ "name": "Protection", "tags": ["protection", "protects-permanent"] },
{ "name": "Recursion", "tags": ["recursion", "reanimate"] },
{ "name": "Extra Combat", "tags": ["extra-combat"] },
{ "name": "Stax", "tags": ["hatebear", "tax"] },
{ "name": "Tokens", "tags": ["repeatable-token-generator"] },
{ "name": "Lifegain", "tags": ["lifegain"] }
```

Insert `"Card Selection"` **immediately after `"Card Draw"`** (so `Board Wipe < Removal < Ramp < Tutor` relative order, which an existing test asserts, is untouched), and insert `"Engine"` and `"Threat"` **immediately before `"Tokens"`** (after `"Stax"`, so `Lifegain` stays the last main category, which another existing test also depends on). The full `categories` array becomes:

```json
[
  { "name": "Win Condition", "tags": ["alternate-win-condition"] },
  { "name": "Board Wipe", "tags": ["board-wipe"] },
  { "name": "Counterspell", "tags": ["counterspell"] },
  { "name": "Removal", "tags": ["removal"] },
  { "name": "Ramp", "tags": ["ramp", "mana-rock", "mana-dork", "land-ramp"] },
  { "name": "Tutor", "tags": ["tutor"] },
  { "name": "Card Draw", "tags": ["draw", "cantrip", "impulse-draw"] },
  { "name": "Card Selection", "tags": ["scry", "surveil", "fateseal"] },
  { "name": "Protection", "tags": ["protection", "protects-permanent"] },
  { "name": "Recursion", "tags": ["recursion", "reanimate"] },
  { "name": "Extra Combat", "tags": ["extra-combat"] },
  { "name": "Stax", "tags": ["hatebear", "tax"] },
  { "name": "Engine", "tags": [] },
  { "name": "Threat", "tags": [] },
  { "name": "Tokens", "tags": ["repeatable-token-generator"] },
  { "name": "Lifegain", "tags": ["lifegain"] }
]
```

Leave `_about` and `longTail` exactly as they are in the live file.

- [ ] **Step 4: Add rules to `functional-rules.json`**

Read the current file first (`backend/src/main/resources/functional-rules.json`). Add these four entries to the `rules` array (position doesn't matter — `FunctionalRules.match` has no ordering dependency, only `category`/`pattern`/`confidence`):

```json
{ "category": "Card Selection", "pattern": "scry \\d+", "confidence": 0.6 },
{ "category": "Card Selection", "pattern": "surveil \\d+", "confidence": 0.6 },
{ "category": "Engine", "pattern": "at the beginning of (your|each) (upkeep|end step|draw step)[^.]*,\\s*you may", "confidence": 0.4 }
```

(Three entries, not four — Card Selection gets two patterns, Engine gets one. No rule is added for Threat: no reliable regex signal exists for "this card is itself a pressuring threat" the way there is for scry/surveil or an upkeep trigger; it stays guess-free until a player role-overrides it or a future milestone adds a real signal.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && ./mvnw -q -o test -Dtest=FunctionalTagMappingTest,FunctionalRulesTest`
Expected: PASS — all existing tests in both files still pass (the relative-priority assertions are unaffected by the insertions above), plus the two new/extended ones.

- [ ] **Step 6: Run the full backend test suite to check for ripple effects**

Run: `cd backend && ./mvnw -q -o test 2>&1 | grep -iE "ERROR|FAIL|BUILD FAILURE" | grep -v "docker\|testcontainers\|Scryfall is rate limiting\|Commander Spellbook"`
Expected: no output (no failures). If anything in `EngineClassifierTest`, `ArchenemyCalculatorTest`, or `DeckHealthCalculatorTest` fails, it means one of those hardcodes the exact *set* of category names rather than just checking for specific ones by name — stop and report back rather than editing those files, since changing them is out of this milestone's scope per the note above.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/functional-tags.json backend/src/main/resources/functional-rules.json backend/src/test/java/io/eregion/card/FunctionalTagMappingTest.java backend/src/test/java/io/eregion/card/FunctionalRulesTest.java
git commit -m "Add Card Selection, Engine and Threat functional-tag categories"
```

---

### Task 3: `DeckPlan` — DTOs, repository, service, controller

**Files:**
- Create: `backend/src/main/java/io/eregion/build/BuildDtos.java`
- Create: `backend/src/main/java/io/eregion/build/DeckPlanRepository.java`
- Create: `backend/src/main/java/io/eregion/build/DeckPlanService.java`
- Create: `backend/src/main/java/io/eregion/build/DeckPlanController.java`
- Test: `backend/src/test/java/io/eregion/build/DeckPlanRepositoryTest.java`
- Test: `backend/src/test/java/io/eregion/build/DeckPlanServiceTest.java`

- [ ] **Step 1: Write `BuildDtos.java` (the shared DTO file for the whole `io.eregion.build` package — later tasks add more records to this same file)**

```java
package io.eregion.build;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class BuildDtos {

	private BuildDtos() {
	}

	public record DeckPlan(String planText, String archetype, Integer bracketTarget, Integer podSize, String tableNotes) {
		public static DeckPlan empty() {
			return new DeckPlan("", "", null, null, "");
		}
	}

	public record SavePlanRequest(
			@Size(max = 20000) String planText,
			@Size(max = 60) String archetype,
			@Min(1) @Max(5) Integer bracketTarget,
			@Min(1) @Max(12) Integer podSize,
			@Size(max = 2000) String tableNotes) {
	}

	public record BenchmarkRange(String category, double min, double max, String source) {
	}

	public record BenchmarkProfile(UUID id, String name, UUID basedOn, List<BenchmarkRange> ranges) {
	}

	public record CreateProfileRequest(@NotBlank @Size(max = 80) String name, UUID basedOn) {
	}

	public record RenameProfileRequest(@NotBlank @Size(max = 80) String name) {
	}

	public record SaveRangeRequest(@NotBlank @Size(max = 40) String category, double min, double max, @NotBlank @Size(max = 200) String source) {
	}

	public record RoleOverrideRequest(@NotBlank @Size(max = 40) String role) {
	}
}
```

- [ ] **Step 2: Write the failing repository test**

```java
package io.eregion.build;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import io.eregion.build.BuildDtos.SavePlanRequest;
import io.eregion.support.PostgresTest;
import org.junit.jupiter.api.Test;

class DeckPlanRepositoryTest extends PostgresTest {

	private final DeckPlanRepository repository = new DeckPlanRepository(jdbc);

	@Test
	void aDeckWithNoPlanYetHasNothingToFind() {
		UUID deck = newDeck("no-plan@example.com");

		assertThat(repository.find(deck)).isEmpty();
	}

	@Test
	void savingTwiceUpdatesTheSameRow() {
		UUID deck = newDeck("plan-twice@example.com");

		repository.save(deck, new SavePlanRequest("Go wide with tokens", "tokens", 3, 4, "rocks get exiled often"));
		repository.save(deck, new SavePlanRequest("Go wide with tokens, v2", "tokens", 3, 4, "rocks get exiled often"));

		var found = repository.find(deck).orElseThrow();
		assertThat(found.planText()).isEqualTo("Go wide with tokens, v2");
		assertThat(found.archetype()).isEqualTo("tokens");
		assertThat(found.bracketTarget()).isEqualTo(3);
		assertThat(found.podSize()).isEqualTo(4);
		assertThat(found.tableNotes()).isEqualTo("rocks get exiled often");
	}

	@Test
	void ownsDeckIsTrueOnlyForTheOwner() {
		UUID owner = jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES ('plan-owner@example.com', 'x', 'Owner') RETURNING id")
				.query(UUID.class).single();
		UUID stranger = jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES ('plan-stranger@example.com', 'x', 'Stranger') RETURNING id")
				.query(UUID.class).single();
		UUID deck = jdbc.sql("INSERT INTO decks (owner_id, name) VALUES (:owner, 'Deck') RETURNING id")
				.param("owner", owner).query(UUID.class).single();

		assertThat(repository.ownsDeck(deck, owner)).isTrue();
		assertThat(repository.ownsDeck(deck, stranger)).isFalse();
	}

	private static UUID newDeck(String email) {
		jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:email, 'x', 'Player') ON CONFLICT DO NOTHING")
				.param("email", email).update();
		return jdbc.sql("INSERT INTO decks (owner_id, name) SELECT id, 'Deck' FROM users WHERE email = :email RETURNING id")
				.param("email", email).query(UUID.class).single();
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && ./mvnw -q -o test -Dtest=DeckPlanRepositoryTest`
Expected: FAIL — `DeckPlanRepository` doesn't exist yet (compile error).

- [ ] **Step 4: Write `DeckPlanRepository.java`**

```java
package io.eregion.build;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import io.eregion.build.BuildDtos.DeckPlan;
import io.eregion.build.BuildDtos.SavePlanRequest;

@Repository
public class DeckPlanRepository {

	private final JdbcClient jdbc;

	public DeckPlanRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public boolean ownsDeck(UUID deckId, UUID userId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM decks WHERE id = :deck AND owner_id = :user)")
				.param("deck", deckId).param("user", userId).query(Boolean.class).single();
	}

	public Optional<DeckPlan> find(UUID deckId) {
		return jdbc.sql("SELECT plan_text, archetype, bracket_target, pod_size, table_notes FROM deck_plan WHERE deck_id = :deck")
				.param("deck", deckId)
				.query((rs, n) -> new DeckPlan(
						rs.getString("plan_text"), rs.getString("archetype"),
						(Integer) rs.getObject("bracket_target"), (Integer) rs.getObject("pod_size"),
						rs.getString("table_notes")))
				.optional();
	}

	public void save(UUID deckId, SavePlanRequest request) {
		jdbc.sql("""
				INSERT INTO deck_plan (deck_id, plan_text, archetype, bracket_target, pod_size, table_notes, updated_at)
				VALUES (:deck, :planText, :archetype, :bracketTarget, :podSize, :tableNotes, now())
				ON CONFLICT (deck_id) DO UPDATE SET
				    plan_text = EXCLUDED.plan_text,
				    archetype = EXCLUDED.archetype,
				    bracket_target = EXCLUDED.bracket_target,
				    pod_size = EXCLUDED.pod_size,
				    table_notes = EXCLUDED.table_notes,
				    updated_at = now()
				""")
				.param("deck", deckId)
				.param("planText", request.planText() == null ? "" : request.planText())
				.param("archetype", request.archetype() == null ? "" : request.archetype())
				.param("bracketTarget", request.bracketTarget())
				.param("podSize", request.podSize())
				.param("tableNotes", request.tableNotes() == null ? "" : request.tableNotes())
				.update();
	}
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./mvnw -q -o test -Dtest=DeckPlanRepositoryTest`
Expected: PASS

- [ ] **Step 6: Write the failing service test**

```java
package io.eregion.build;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Optional;
import java.util.UUID;

import io.eregion.build.BuildDtos.DeckPlan;
import io.eregion.build.BuildDtos.SavePlanRequest;
import io.eregion.common.ApiException;
import org.junit.jupiter.api.Test;

class DeckPlanServiceTest {

	@Test
	void aDeckWithNoPlanYetAnswersEmpty() {
		DeckPlanService service = new DeckPlanService(new FakeRepository(true, Optional.empty()));

		assertThat(service.get(UUID.randomUUID(), UUID.randomUUID())).isEqualTo(DeckPlan.empty());
	}

	@Test
	void aStrangerCannotReadOrSaveAnotherPlayersPlan() {
		DeckPlanService service = new DeckPlanService(new FakeRepository(false, Optional.empty()));
		UUID deck = UUID.randomUUID();
		UUID stranger = UUID.randomUUID();

		assertThatThrownBy(() -> service.get(stranger, deck)).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> service.save(stranger, deck, new SavePlanRequest("x", "", null, null, "")))
				.isInstanceOf(ApiException.class);
	}

	/** A hand-written stand-in for the repository, so the service's ownership and empty-default logic is tested without a real database. */
	private static final class FakeRepository extends DeckPlanRepository {
		private final boolean owns;
		private final Optional<DeckPlan> stored;

		FakeRepository(boolean owns, Optional<DeckPlan> stored) {
			super(null);
			this.owns = owns;
			this.stored = stored;
		}

		@Override
		public boolean ownsDeck(UUID deckId, UUID userId) {
			return owns;
		}

		@Override
		public Optional<DeckPlan> find(UUID deckId) {
			return stored;
		}

		@Override
		public void save(UUID deckId, SavePlanRequest request) {
			// Not exercised by these tests.
		}
	}
}
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd backend && ./mvnw -q -o test -Dtest=DeckPlanServiceTest`
Expected: FAIL — `DeckPlanService` doesn't exist yet.

- [ ] **Step 8: Write `DeckPlanService.java`**

```java
package io.eregion.build;

import java.util.UUID;

import org.springframework.stereotype.Service;

import io.eregion.build.BuildDtos.DeckPlan;
import io.eregion.build.BuildDtos.SavePlanRequest;
import io.eregion.common.ApiException;

@Service
public class DeckPlanService {

	private final DeckPlanRepository repository;

	public DeckPlanService(DeckPlanRepository repository) {
		this.repository = repository;
	}

	public DeckPlan get(UUID userId, UUID deckId) {
		owned(deckId, userId);
		return repository.find(deckId).orElse(DeckPlan.empty());
	}

	public DeckPlan save(UUID userId, UUID deckId, SavePlanRequest request) {
		owned(deckId, userId);
		repository.save(deckId, request);
		return repository.find(deckId).orElseThrow();
	}

	private void owned(UUID deckId, UUID userId) {
		if (!repository.ownsDeck(deckId, userId)) {
			throw ApiException.notFound("Deck");
		}
	}
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd backend && ./mvnw -q -o test -Dtest=DeckPlanServiceTest`
Expected: PASS

- [ ] **Step 10: Write `DeckPlanController.java`**

```java
package io.eregion.build;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.build.BuildDtos.DeckPlan;
import io.eregion.build.BuildDtos.SavePlanRequest;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/decks/{deckId}/plan")
public class DeckPlanController {

	private final DeckPlanService service;

	public DeckPlanController(DeckPlanService service) {
		this.service = service;
	}

	@GetMapping
	public DeckPlan get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return service.get(CurrentUser.id(jwt), deckId);
	}

	@PutMapping
	public DeckPlan save(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @Valid @RequestBody SavePlanRequest request) {
		return service.save(CurrentUser.id(jwt), deckId, request);
	}
}
```

- [ ] **Step 11: Run the whole `io.eregion.build` package's tests together**

Run: `cd backend && ./mvnw -q -o test -Dtest=BuildMigrationTest,DeckPlanRepositoryTest,DeckPlanServiceTest`
Expected: PASS (all three)

- [ ] **Step 12: Commit**

```bash
git add backend/src/main/java/io/eregion/build/BuildDtos.java backend/src/main/java/io/eregion/build/DeckPlanRepository.java backend/src/main/java/io/eregion/build/DeckPlanService.java backend/src/main/java/io/eregion/build/DeckPlanController.java backend/src/test/java/io/eregion/build/DeckPlanRepositoryTest.java backend/src/test/java/io/eregion/build/DeckPlanServiceTest.java
git commit -m "Add DeckPlan CRUD under /api/decks/{deckId}/plan"
```

---

### Task 4: `BenchmarkProfile` / `BenchmarkRange` — repository, service with seeding, controller

**Files:**
- Modify: `backend/src/main/java/io/eregion/build/BuildDtos.java` (records already added in Task 3, Step 1 — no change needed here)
- Create: `backend/src/main/java/io/eregion/build/BenchmarkProfileRepository.java`
- Create: `backend/src/main/java/io/eregion/build/BenchmarkProfileService.java`
- Create: `backend/src/main/java/io/eregion/build/BenchmarkProfileController.java`
- Test: `backend/src/test/java/io/eregion/build/BenchmarkProfileRepositoryTest.java`
- Test: `backend/src/test/java/io/eregion/build/BenchmarkProfileServiceTest.java`

- [ ] **Step 1: Write the failing repository test**

```java
package io.eregion.build;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import io.eregion.build.BuildDtos.BenchmarkProfile;
import io.eregion.support.PostgresTest;
import org.junit.jupiter.api.Test;

class BenchmarkProfileRepositoryTest extends PostgresTest {

	private final BenchmarkProfileRepository repository = new BenchmarkProfileRepository(jdbc);

	@Test
	void aNewUserHasNoProfilesYet() {
		UUID user = newUser("no-profiles@example.com");

		assertThat(repository.countForUser(user)).isZero();
		assertThat(repository.listForUser(user)).isEmpty();
	}

	@Test
	void aProfileCarriesItsRanges() {
		UUID user = newUser("with-ranges@example.com");
		UUID profileId = repository.insertProfile(user, "Upgraded (Bracket 3) Midrange", null);

		repository.insertRange(profileId, "ramp", 8, 12, "EDHREC 8-12");
		repository.insertRange(profileId, "lands", 36, 37, "ScrollVault Bracket 3 targets");

		var profiles = repository.listForUser(user);
		assertThat(profiles).hasSize(1);
		BenchmarkProfile profile = profiles.get(0);
		assertThat(profile.name()).isEqualTo("Upgraded (Bracket 3) Midrange");
		assertThat(profile.ranges()).hasSize(2);
		assertThat(profile.ranges()).anySatisfy(range -> {
			assertThat(range.category()).isEqualTo("ramp");
			assertThat(range.min()).isEqualTo(8.0);
			assertThat(range.max()).isEqualTo(12.0);
			assertThat(range.source()).isEqualTo("EDHREC 8-12");
		});
	}

	@Test
	void insertingTheSameCategoryTwiceReplacesIt() {
		UUID user = newUser("replace-range@example.com");
		UUID profileId = repository.insertProfile(user, "Profile", null);

		repository.insertRange(profileId, "ramp", 8, 12, "first");
		repository.insertRange(profileId, "ramp", 9, 13, "second");

		var ranges = repository.listForUser(user).get(0).ranges();
		assertThat(ranges).hasSize(1);
		assertThat(ranges.get(0).min()).isEqualTo(9.0);
		assertThat(ranges.get(0).source()).isEqualTo("second");
	}

	@Test
	void deletingARangeLeavesTheOthers() {
		UUID user = newUser("delete-range@example.com");
		UUID profileId = repository.insertProfile(user, "Profile", null);
		repository.insertRange(profileId, "ramp", 8, 12, "a");
		repository.insertRange(profileId, "lands", 36, 37, "b");

		repository.deleteRange(profileId, "ramp");

		var ranges = repository.listForUser(user).get(0).ranges();
		assertThat(ranges).hasSize(1);
		assertThat(ranges.get(0).category()).isEqualTo("lands");
	}

	@Test
	void ownsProfileIsTrueOnlyForItsOwner() {
		UUID owner = newUser("profile-owner@example.com");
		UUID stranger = newUser("profile-stranger@example.com");
		UUID profileId = repository.insertProfile(owner, "Profile", null);

		assertThat(repository.ownsProfile(profileId, owner)).isTrue();
		assertThat(repository.ownsProfile(profileId, stranger)).isFalse();
	}

	private static UUID newUser(String email) {
		return jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:email, 'x', 'Player') RETURNING id")
				.param("email", email).query(UUID.class).single();
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw -q -o test -Dtest=BenchmarkProfileRepositoryTest`
Expected: FAIL — `BenchmarkProfileRepository` doesn't exist yet.

- [ ] **Step 3: Write `BenchmarkProfileRepository.java`**

```java
package io.eregion.build;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import io.eregion.build.BuildDtos.BenchmarkProfile;
import io.eregion.build.BuildDtos.BenchmarkRange;

@Repository
public class BenchmarkProfileRepository {

	private final JdbcClient jdbc;

	public BenchmarkProfileRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public int countForUser(UUID userId) {
		return jdbc.sql("SELECT COUNT(*) FROM benchmark_profile WHERE user_id = :user")
				.param("user", userId).query(Integer.class).single();
	}

	public boolean ownsProfile(UUID profileId, UUID userId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM benchmark_profile WHERE id = :id AND user_id = :user)")
				.param("id", profileId).param("user", userId).query(Boolean.class).single();
	}

	public UUID insertProfile(UUID userId, String name, UUID basedOn) {
		return jdbc.sql("INSERT INTO benchmark_profile (user_id, name, based_on) VALUES (:user, :name, :basedOn) RETURNING id")
				.param("user", userId).param("name", name).param("basedOn", basedOn)
				.query(UUID.class).single();
	}

	public void renameProfile(UUID profileId, String name) {
		jdbc.sql("UPDATE benchmark_profile SET name = :name WHERE id = :id")
				.param("name", name).param("id", profileId).update();
	}

	public void deleteProfile(UUID profileId) {
		jdbc.sql("DELETE FROM benchmark_profile WHERE id = :id").param("id", profileId).update();
	}

	public void insertRange(UUID profileId, String category, double min, double max, String source) {
		jdbc.sql("""
				INSERT INTO benchmark_range (profile_id, category, min_value, max_value, source)
				VALUES (:profile, :category, :min, :max, :source)
				ON CONFLICT (profile_id, category) DO UPDATE SET
				    min_value = EXCLUDED.min_value, max_value = EXCLUDED.max_value, source = EXCLUDED.source
				""")
				.param("profile", profileId).param("category", category).param("min", min).param("max", max).param("source", source)
				.update();
	}

	public void deleteRange(UUID profileId, String category) {
		jdbc.sql("DELETE FROM benchmark_range WHERE profile_id = :profile AND category = :category")
				.param("profile", profileId).param("category", category).update();
	}

	public List<BenchmarkProfile> listForUser(UUID userId) {
		Map<UUID, List<BenchmarkRange>> rangesByProfile = new LinkedHashMap<>();
		jdbc.sql("""
				SELECT r.profile_id, r.category, r.min_value, r.max_value, r.source
				  FROM benchmark_range r
				  JOIN benchmark_profile p ON p.id = r.profile_id
				 WHERE p.user_id = :user
				""")
				.param("user", userId)
				.query((rs, n) -> {
					rangesByProfile.computeIfAbsent(rs.getObject("profile_id", UUID.class), key -> new ArrayList<>())
							.add(new BenchmarkRange(rs.getString("category"), rs.getDouble("min_value"), rs.getDouble("max_value"), rs.getString("source")));
					return null;
				})
				.list();

		return jdbc.sql("SELECT id, name, based_on FROM benchmark_profile WHERE user_id = :user ORDER BY created_at")
				.param("user", userId)
				.query((rs, n) -> {
					UUID id = rs.getObject("id", UUID.class);
					return new BenchmarkProfile(id, rs.getString("name"), rs.getObject("based_on", UUID.class),
							rangesByProfile.getOrDefault(id, List.of()));
				})
				.list();
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./mvnw -q -o test -Dtest=BenchmarkProfileRepositoryTest`
Expected: PASS

- [ ] **Step 5: Write the failing service test (seeding + ownership)**

```java
package io.eregion.build;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import io.eregion.build.BuildDtos.SaveRangeRequest;
import io.eregion.common.ApiException;
import io.eregion.support.PostgresTest;
import org.junit.jupiter.api.Test;

/**
 * Uses the real repository against Testcontainers Postgres: the thing worth testing here (seeding, validation)
 * is only meaningful once real rows are involved, so a hand-written fake would just duplicate the SQL.
 */
class BenchmarkProfileServiceTest extends PostgresTest {

	private final BenchmarkProfileRepository repository = new BenchmarkProfileRepository(jdbc);
	private final BenchmarkProfileService service = new BenchmarkProfileService(repository);

	@Test
	void firstListSeedsTheThreeDefaultProfiles() {
		UUID user = newUser("seed-me@example.com");

		var profiles = service.list(user);

		assertThat(profiles).extracting("name").containsExactlyInAnyOrder(
				"Upgraded (Bracket 3) Midrange", "Battlecruiser", "Casual (Bracket 2)");
		// Every range on every seeded profile names a real source, never an invented number with no citation.
		assertThat(profiles).allSatisfy(profile ->
				assertThat(profile.ranges()).allSatisfy(range -> assertThat(range.source()).isNotBlank()));
	}

	@Test
	void seedingOnlyHappensOnce() {
		UUID user = newUser("seed-once@example.com");

		service.list(user);
		service.list(user);

		assertThat(repository.countForUser(user)).isEqualTo(3);
	}

	@Test
	void aStrangerCannotEditAnotherPlayersProfile() {
		UUID owner = newUser("profile-service-owner@example.com");
		UUID stranger = newUser("profile-service-stranger@example.com");
		UUID profileId = repository.insertProfile(owner, "Profile", null);

		assertThatThrownBy(() -> service.saveRange(stranger, profileId, new SaveRangeRequest("ramp", 8, 12, "x")))
				.isInstanceOf(ApiException.class);
	}

	@Test
	void aRangeWhoseMaxIsBelowItsMinIsRejected() {
		UUID user = newUser("bad-range@example.com");
		UUID profileId = repository.insertProfile(user, "Profile", null);

		assertThatThrownBy(() -> service.saveRange(user, profileId, new SaveRangeRequest("ramp", 12, 8, "x")))
				.isInstanceOf(ApiException.class);
	}

	private static UUID newUser(String email) {
		return jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:email, 'x', 'Player') RETURNING id")
				.param("email", email).query(UUID.class).single();
	}
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && ./mvnw -q -o test -Dtest=BenchmarkProfileServiceTest`
Expected: FAIL — `BenchmarkProfileService` doesn't exist yet.

- [ ] **Step 7: Write `BenchmarkProfileService.java`**

Every seeded number below is transcribed from the design spec's research digest (`docs/superpowers/specs/2026-11-06-deck-builder-workflow-design.md`, which carries it from the original brief's section 4); a category the digest gives no number for is left out of that profile entirely rather than guessed — see the comment on each profile for which digest claim backs which number.

```java
package io.eregion.build;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;

import io.eregion.build.BuildDtos.BenchmarkProfile;
import io.eregion.build.BuildDtos.SaveRangeRequest;
import io.eregion.common.ApiException;

@Service
public class BenchmarkProfileService {

	private final BenchmarkProfileRepository repository;

	public BenchmarkProfileService(BenchmarkProfileRepository repository) {
		this.repository = repository;
	}

	public List<BenchmarkProfile> list(UUID userId) {
		if (repository.countForUser(userId) == 0) {
			seedDefaults(userId);
		}
		return repository.listForUser(userId);
	}

	public BenchmarkProfile create(UUID userId, String name, UUID basedOn) {
		if (basedOn != null && !repository.ownsProfile(basedOn, userId)) {
			throw ApiException.notFound("Profile");
		}
		UUID id = repository.insertProfile(userId, name, basedOn);
		if (basedOn != null) {
			find(userId, basedOn).ranges()
					.forEach(range -> repository.insertRange(id, range.category(), range.min(), range.max(), range.source()));
		}
		return find(userId, id);
	}

	public BenchmarkProfile rename(UUID userId, UUID profileId, String name) {
		owned(profileId, userId);
		repository.renameProfile(profileId, name);
		return find(userId, profileId);
	}

	public void delete(UUID userId, UUID profileId) {
		owned(profileId, userId);
		repository.deleteProfile(profileId);
	}

	public BenchmarkProfile saveRange(UUID userId, UUID profileId, SaveRangeRequest request) {
		owned(profileId, userId);
		if (request.max() < request.min()) {
			throw ApiException.badRequest("The upper end of a range cannot be below its lower end.");
		}
		repository.insertRange(profileId, request.category(), request.min(), request.max(), request.source());
		return find(userId, profileId);
	}

	public BenchmarkProfile deleteRange(UUID userId, UUID profileId, String category) {
		owned(profileId, userId);
		repository.deleteRange(profileId, category);
		return find(userId, profileId);
	}

	private BenchmarkProfile find(UUID userId, UUID profileId) {
		return repository.listForUser(userId).stream()
				.filter(profile -> profile.id().equals(profileId))
				.findFirst()
				.orElseThrow(() -> ApiException.notFound("Profile"));
	}

	private void owned(UUID profileId, UUID userId) {
		if (!repository.ownsProfile(profileId, userId)) {
			throw ApiException.notFound("Profile");
		}
	}

	private void seedDefaults(UUID userId) {
		UUID midrange = repository.insertProfile(userId, "Upgraded (Bracket 3) Midrange", null);
		repository.insertRange(midrange, "win_condition", 7, 10, "EDHREC, How to Build a Commander Deck: at least 7 win conditions");
		repository.insertRange(midrange, "ramp", 8, 12, "EDHREC 8-12; Nerd Leagues 8x8 8-12; ScrollVault 10-10-10 about 10");
		repository.insertRange(midrange, "card_advantage", 8, 10, "EDHREC: card velocity 8-10; ScrollVault 10-10-10 about 10 draw");
		repository.insertRange(midrange, "spot_removal", 6, 8, "EDHREC interaction 8-10, including 3-4 offensive and 3-4 defensive removal");
		repository.insertRange(midrange, "board_wipe", 2, 3, "EDHREC: at least 2 wraths; Nerd Leagues 8x8: 2-3 wipes");
		repository.insertRange(midrange, "lands", 36, 37, "ScrollVault Bracket 3 targets: 36-37 lands");
		repository.insertRange(midrange, "average_mana_value", 2.8, 3.2, "ScrollVault Bracket 3 targets: curve 2.8-3.2");

		UUID battlecruiser = repository.insertProfile(userId, "Battlecruiser", null);
		repository.insertRange(battlecruiser, "ramp", 8, 10, "ScrollVault land-count simulations: Battlecruiser at 3.5 average mana value, 8 ramp");
		repository.insertRange(battlecruiser, "lands", 38, 40, "ScrollVault land-count simulations: Battlecruiser at 3.5 average mana value, 38-40 lands");
		repository.insertRange(battlecruiser, "average_mana_value", 3.5, 4.0, "ScrollVault land-count simulations: Battlecruiser profile at 3.5+ average mana value");

		UUID casual = repository.insertProfile(userId, "Casual (Bracket 2)", null);
		repository.insertRange(casual, "ramp", 8, 12, "EDHREC 8-12; Nerd Leagues 8x8 8-12 (general guidance, not bracket-specific)");
		repository.insertRange(casual, "card_advantage", 8, 10, "EDHREC: card velocity 8-10 (general guidance)");
		repository.insertRange(casual, "board_wipe", 2, 3, "Nerd Leagues 8x8: 2-3 wipes (general guidance)");
		repository.insertRange(casual, "lands", 36, 38, "EDHREC: lands near 36-38, higher if the commander costs 5 or more (general guidance)");
	}
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && ./mvnw -q -o test -Dtest=BenchmarkProfileServiceTest`
Expected: PASS

- [ ] **Step 9: Write `BenchmarkProfileController.java`**

```java
package io.eregion.build;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.build.BuildDtos.BenchmarkProfile;
import io.eregion.build.BuildDtos.CreateProfileRequest;
import io.eregion.build.BuildDtos.RenameProfileRequest;
import io.eregion.build.BuildDtos.SaveRangeRequest;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/benchmark-profiles")
public class BenchmarkProfileController {

	private final BenchmarkProfileService service;

	public BenchmarkProfileController(BenchmarkProfileService service) {
		this.service = service;
	}

	@GetMapping
	public List<BenchmarkProfile> list(@AuthenticationPrincipal Jwt jwt) {
		return service.list(CurrentUser.id(jwt));
	}

	@PostMapping
	public BenchmarkProfile create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateProfileRequest request) {
		return service.create(CurrentUser.id(jwt), request.name(), request.basedOn());
	}

	@PutMapping("/{profileId}")
	public BenchmarkProfile rename(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID profileId, @Valid @RequestBody RenameProfileRequest request) {
		return service.rename(CurrentUser.id(jwt), profileId, request.name());
	}

	@DeleteMapping("/{profileId}")
	public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID profileId) {
		service.delete(CurrentUser.id(jwt), profileId);
	}

	@PutMapping("/{profileId}/ranges")
	public BenchmarkProfile saveRange(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID profileId, @Valid @RequestBody SaveRangeRequest request) {
		return service.saveRange(CurrentUser.id(jwt), profileId, request);
	}

	@DeleteMapping("/{profileId}/ranges/{category}")
	public BenchmarkProfile deleteRange(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID profileId, @PathVariable String category) {
		return service.deleteRange(CurrentUser.id(jwt), profileId, category);
	}
}
```

- [ ] **Step 10: Run all of this task's tests together**

Run: `cd backend && ./mvnw -q -o test -Dtest=BenchmarkProfileRepositoryTest,BenchmarkProfileServiceTest`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add backend/src/main/java/io/eregion/build/BenchmarkProfileRepository.java backend/src/main/java/io/eregion/build/BenchmarkProfileService.java backend/src/main/java/io/eregion/build/BenchmarkProfileController.java backend/src/test/java/io/eregion/build/BenchmarkProfileRepositoryTest.java backend/src/test/java/io/eregion/build/BenchmarkProfileServiceTest.java
git commit -m "Add benchmark profile/range CRUD with three sourced seed profiles"
```

---

### Task 5: `RoleOverride` — repository, service, controller

**Files:**
- Create: `backend/src/main/java/io/eregion/build/RoleOverrideRepository.java`
- Create: `backend/src/main/java/io/eregion/build/RoleOverrideService.java`
- Create: `backend/src/main/java/io/eregion/build/RoleOverrideController.java`
- Test: `backend/src/test/java/io/eregion/build/RoleOverrideRepositoryTest.java`
- Test: `backend/src/test/java/io/eregion/build/RoleOverrideServiceTest.java`

- [ ] **Step 1: Write the failing repository test**

```java
package io.eregion.build;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import io.eregion.support.PostgresTest;
import org.junit.jupiter.api.Test;

class RoleOverrideRepositoryTest extends PostgresTest {

	private final RoleOverrideRepository repository = new RoleOverrideRepository(jdbc);

	@Test
	void settingThenClearingLeavesNoOverride() {
		UUID user = newUser("override-user@example.com");
		UUID card = newCard("Sol Ring");

		repository.set(user, card, "Ramp");
		assertThat(repository.forUser(user)).containsEntry(card, "Ramp");

		repository.clear(user, card);
		assertThat(repository.forUser(user)).doesNotContainKey(card);
	}

	@Test
	void settingTwiceReplacesTheRole() {
		UUID user = newUser("override-twice@example.com");
		UUID card = newCard("Arcane Signet");

		repository.set(user, card, "Ramp");
		repository.set(user, card, "Engine");

		assertThat(repository.forUser(user)).containsEntry(card, "Engine");
	}

	@Test
	void overridesArePerUser() {
		UUID first = newUser("override-first@example.com");
		UUID second = newUser("override-second@example.com");
		UUID card = newCard("Demonic Tutor");

		repository.set(first, card, "Tutor");

		assertThat(repository.forUser(first)).containsEntry(card, "Tutor");
		assertThat(repository.forUser(second)).isEmpty();
	}

	@Test
	void cardExistsIsTrueOnlyForARealCard() {
		UUID card = newCard("Fake Test Card");

		assertThat(repository.cardExists(card)).isTrue();
		assertThat(repository.cardExists(UUID.randomUUID())).isFalse();
	}

	private static UUID newUser(String email) {
		return jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:email, 'x', 'Player') RETURNING id")
				.param("email", email).query(UUID.class).single();
	}

	private static UUID newCard(String name) {
		return jdbc.sql("""
				INSERT INTO cards (scryfall_id, name, mana_cost, mana_value, type_line, primary_type, colors, color_identity,
				                    oracle_text, power, toughness, set_code, set_name, collector_number, rarity, artist,
				                    image_small, image_normal, image_art_crop, commander_legality)
				VALUES (gen_random_uuid(), :name, '', 0, 'Artifact', 'Artifact', '', '', '', '', '', 'tst', 'Test', '1',
				        'common', '', '', '', '', 'legal')
				RETURNING id
				""")
				.param("name", name).query(UUID.class).single();
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw -q -o test -Dtest=RoleOverrideRepositoryTest`
Expected: FAIL — `RoleOverrideRepository` doesn't exist yet. (If this fails instead on the `newCard` insert because `cards` has columns this plan's copy of the schema doesn't know about, check `backend/src/main/resources/db/migration/V1__init.sql` plus `V26__add_power_toughness_to_cards.sql` for the live column list and adjust the insert — do not guess.)

- [ ] **Step 3: Write `RoleOverrideRepository.java`**

```java
package io.eregion.build;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class RoleOverrideRepository {

	private final JdbcClient jdbc;

	public RoleOverrideRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public void set(UUID userId, UUID cardId, String role) {
		jdbc.sql("""
				INSERT INTO role_override (user_id, card_id, role) VALUES (:user, :card, :role)
				ON CONFLICT (user_id, card_id) DO UPDATE SET role = EXCLUDED.role
				""")
				.param("user", userId).param("card", cardId).param("role", role).update();
	}

	public void clear(UUID userId, UUID cardId) {
		jdbc.sql("DELETE FROM role_override WHERE user_id = :user AND card_id = :card")
				.param("user", userId).param("card", cardId).update();
	}

	public Map<UUID, String> forUser(UUID userId) {
		Map<UUID, String> result = new LinkedHashMap<>();
		jdbc.sql("SELECT card_id, role FROM role_override WHERE user_id = :user")
				.param("user", userId)
				.query((rs, n) -> {
					result.put(rs.getObject("card_id", UUID.class), rs.getString("role"));
					return null;
				})
				.list();
		return result;
	}

	public boolean cardExists(UUID cardId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM cards WHERE id = :id)")
				.param("id", cardId).query(Boolean.class).single();
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./mvnw -q -o test -Dtest=RoleOverrideRepositoryTest`
Expected: PASS

- [ ] **Step 5: Write the failing service test**

```java
package io.eregion.build;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import io.eregion.common.ApiException;
import io.eregion.support.PostgresTest;
import org.junit.jupiter.api.Test;

class RoleOverrideServiceTest extends PostgresTest {

	private final RoleOverrideRepository repository = new RoleOverrideRepository(jdbc);
	private final RoleOverrideService service = new RoleOverrideService(repository);

	@Test
	void settingAKnownRoleOnARealCardWorks() {
		UUID user = newUser("role-service-ok@example.com");
		UUID card = newCard("Rampant Growth");

		service.set(user, card, "Ramp");

		assertThat(service.list(user)).containsEntry(card, "Ramp");
	}

	@Test
	void uncategorizedIsAcceptedAsAnExplicitOverride() {
		UUID user = newUser("role-service-uncat@example.com");
		UUID card = newCard("Pet Card");

		service.set(user, card, "Uncategorized");

		assertThat(service.list(user)).containsEntry(card, "Uncategorized");
	}

	@Test
	void anUnknownRoleNameIsRejected() {
		UUID user = newUser("role-service-bad-role@example.com");
		UUID card = newCard("Bad Role Card");

		assertThatThrownBy(() -> service.set(user, card, "Not A Real Role")).isInstanceOf(ApiException.class);
	}

	@Test
	void settingARoleOnACardThatDoesNotExistIsRejected() {
		UUID user = newUser("role-service-bad-card@example.com");

		assertThatThrownBy(() -> service.set(user, UUID.randomUUID(), "Ramp")).isInstanceOf(ApiException.class);
	}

	private static UUID newUser(String email) {
		return jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:email, 'x', 'Player') RETURNING id")
				.param("email", email).query(UUID.class).single();
	}

	private static UUID newCard(String name) {
		return jdbc.sql("""
				INSERT INTO cards (scryfall_id, name, mana_cost, mana_value, type_line, primary_type, colors, color_identity,
				                    oracle_text, power, toughness, set_code, set_name, collector_number, rarity, artist,
				                    image_small, image_normal, image_art_crop, commander_legality)
				VALUES (gen_random_uuid(), :name, '', 0, 'Sorcery', 'Sorcery', '', '', '', '', '', 'tst', 'Test', '1',
				        'common', '', '', '', '', 'legal')
				RETURNING id
				""")
				.param("name", name).query(UUID.class).single();
	}
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && ./mvnw -q -o test -Dtest=RoleOverrideServiceTest`
Expected: FAIL — `RoleOverrideService` doesn't exist yet.

- [ ] **Step 7: Write `RoleOverrideService.java`**

```java
package io.eregion.build;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;

import io.eregion.card.FunctionalTagMapping;
import io.eregion.common.ApiException;

@Service
public class RoleOverrideService {

	static final String UNCATEGORIZED = "Uncategorized";

	private final RoleOverrideRepository repository;
	private final Set<String> allowedRoles;

	public RoleOverrideService(RoleOverrideRepository repository) {
		this.repository = repository;
		Set<String> roles = new LinkedHashSet<>();
		FunctionalTagMapping.load().categories().forEach(category -> roles.add(category.name()));
		roles.add(UNCATEGORIZED);
		this.allowedRoles = Collections.unmodifiableSet(roles);
	}

	public Map<UUID, String> list(UUID userId) {
		return repository.forUser(userId);
	}

	public void set(UUID userId, UUID cardId, String role) {
		if (!allowedRoles.contains(role)) {
			throw ApiException.badRequest("Unknown role: " + role);
		}
		if (!repository.cardExists(cardId)) {
			throw ApiException.notFound("Card");
		}
		repository.set(userId, cardId, role);
	}

	public void clear(UUID userId, UUID cardId) {
		repository.clear(userId, cardId);
	}
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && ./mvnw -q -o test -Dtest=RoleOverrideServiceTest`
Expected: PASS

- [ ] **Step 9: Write `RoleOverrideController.java`**

```java
package io.eregion.build;

import java.util.Map;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.build.BuildDtos.RoleOverrideRequest;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/role-overrides")
public class RoleOverrideController {

	private final RoleOverrideService service;

	public RoleOverrideController(RoleOverrideService service) {
		this.service = service;
	}

	@GetMapping
	public Map<UUID, String> list(@AuthenticationPrincipal Jwt jwt) {
		return service.list(CurrentUser.id(jwt));
	}

	@PutMapping("/{cardId}")
	public void set(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID cardId, @Valid @RequestBody RoleOverrideRequest request) {
		service.set(CurrentUser.id(jwt), cardId, request.role());
	}

	@DeleteMapping("/{cardId}")
	public void clear(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID cardId) {
		service.clear(CurrentUser.id(jwt), cardId);
	}
}
```

- [ ] **Step 10: Run all of this task's tests together**

Run: `cd backend && ./mvnw -q -o test -Dtest=RoleOverrideRepositoryTest,RoleOverrideServiceTest`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add backend/src/main/java/io/eregion/build/RoleOverrideRepository.java backend/src/main/java/io/eregion/build/RoleOverrideService.java backend/src/main/java/io/eregion/build/RoleOverrideController.java backend/src/test/java/io/eregion/build/RoleOverrideRepositoryTest.java backend/src/test/java/io/eregion/build/RoleOverrideServiceTest.java
git commit -m "Add role override CRUD under /api/role-overrides"
```

---

### Task 6: Frontend types and hooks

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/useDeckPlan.ts`
- Create: `frontend/src/lib/useBenchmarkProfiles.ts`
- Create: `frontend/src/lib/useRoleOverrides.ts`

No new frontend tests: these are thin fetch-wrapper hooks with no branching logic of their own, the same shape as the existing `useProxies.ts`/`useLore.ts`, neither of which has a test file — `frontend/src/lib/*.test.ts` files in this codebase are reserved for pure logic (`decklist.ts`, `legality.ts`, `versions.ts`), not hooks. Verification here is `tsc --noEmit` plus the manual smoke check in Step 5.

- [ ] **Step 1: Add the new types to `frontend/src/lib/types.ts`**

Add near the end of the file (after the existing `DeckLore` interface, matching that interface's own placement at the bottom):

```typescript
export interface DeckPlan {
  planText: string;
  archetype: string;
  bracketTarget: number | null;
  podSize: number | null;
  tableNotes: string;
}

export interface BenchmarkRange {
  category: string;
  min: number;
  max: number;
  source: string;
}

export interface BenchmarkProfile {
  id: string;
  name: string;
  basedOn: string | null;
  ranges: BenchmarkRange[];
}
```

- [ ] **Step 2: Write `frontend/src/lib/useDeckPlan.ts`**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { DeckPlan } from "./types";

const EMPTY: DeckPlan = { planText: "", archetype: "", bracketTarget: null, podSize: null, tableNotes: "" };

/** A deck's build plan: free text, archetype, table context. One row per deck. */
export function useDeckPlan(deckId: string) {
  const [plan, setPlan] = useState<DeckPlan>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setPlan(await api<DeckPlan>(`/api/decks/${deckId}/plan`));
    setLoaded(true);
  }, [deckId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (next: DeckPlan) => {
      const saved = await api<DeckPlan>(`/api/decks/${deckId}/plan`, { method: "PUT", body: next });
      setPlan(saved);
      return saved;
    },
    [deckId],
  );

  return { plan, loaded, save };
}
```

- [ ] **Step 3: Write `frontend/src/lib/useBenchmarkProfiles.ts`**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { BenchmarkProfile } from "./types";

/** The signed-in player's benchmark profiles, seeded with the three defaults on first load. */
export function useBenchmarkProfiles() {
  const [profiles, setProfiles] = useState<BenchmarkProfile[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setProfiles(await api<BenchmarkProfile[]>("/api/benchmark-profiles"));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(async (name: string, basedOn?: string) => {
    const created = await api<BenchmarkProfile>("/api/benchmark-profiles", { method: "POST", body: { name, basedOn: basedOn ?? null } });
    setProfiles((previous) => [...previous, created]);
    return created;
  }, []);

  const rename = useCallback(async (profileId: string, name: string) => {
    const saved = await api<BenchmarkProfile>(`/api/benchmark-profiles/${profileId}`, { method: "PUT", body: { name } });
    setProfiles((previous) => previous.map((profile) => (profile.id === profileId ? saved : profile)));
    return saved;
  }, []);

  const remove = useCallback(async (profileId: string) => {
    await api<void>(`/api/benchmark-profiles/${profileId}`, { method: "DELETE" });
    setProfiles((previous) => previous.filter((profile) => profile.id !== profileId));
  }, []);

  const saveRange = useCallback(async (profileId: string, range: { category: string; min: number; max: number; source: string }) => {
    const saved = await api<BenchmarkProfile>(`/api/benchmark-profiles/${profileId}/ranges`, { method: "PUT", body: range });
    setProfiles((previous) => previous.map((profile) => (profile.id === profileId ? saved : profile)));
    return saved;
  }, []);

  const deleteRange = useCallback(async (profileId: string, category: string) => {
    const saved = await api<BenchmarkProfile>(`/api/benchmark-profiles/${profileId}/ranges/${encodeURIComponent(category)}`, { method: "DELETE" });
    setProfiles((previous) => previous.map((profile) => (profile.id === profileId ? saved : profile)));
    return saved;
  }, []);

  return { profiles, loaded, create, rename, remove, saveRange, deleteRange };
}
```

- [ ] **Step 4: Write `frontend/src/lib/useRoleOverrides.ts`**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/** The signed-in player's role overrides, card id to role, outranking the automatic tag everywhere it is read. */
export function useRoleOverrides() {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setOverrides(await api<Record<string, string>>("/api/role-overrides"));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const set = useCallback(async (cardId: string, role: string) => {
    await api<void>(`/api/role-overrides/${cardId}`, { method: "PUT", body: { role } });
    setOverrides((previous) => ({ ...previous, [cardId]: role }));
  }, []);

  const clear = useCallback(async (cardId: string) => {
    await api<void>(`/api/role-overrides/${cardId}`, { method: "DELETE" });
    setOverrides((previous) => {
      const next = { ...previous };
      delete next[cardId];
      return next;
    });
  }, []);

  return { overrides, loaded, set, clear };
}
```

- [ ] **Step 5: Typecheck and run the existing frontend test suite**

Run: `cd frontend && npx tsc --noEmit`
Expected: no output (no type errors)

Run: `cd frontend && npm test 2>&1 | tail -15`
Expected: the existing test count passes unchanged (no new tests added this task, none should break)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/useDeckPlan.ts frontend/src/lib/useBenchmarkProfiles.ts frontend/src/lib/useRoleOverrides.ts
git commit -m "Add frontend types and hooks for deck plan, benchmark profiles and role overrides"
```

---

### Task 7: Full-suite verification and backend restart

**Files:** none (verification only)

- [ ] **Step 1: Run the complete backend test suite**

Run: `cd backend && ./mvnw -q -o test 2>&1 | grep -iE "ERROR|FAIL|BUILD FAILURE" | grep -v "docker\|testcontainers\|Scryfall is rate limiting\|Commander Spellbook"`
Expected: no output

- [ ] **Step 2: Run the complete frontend test suite and typecheck**

Run: `cd frontend && npx tsc --noEmit && npm test 2>&1 | tail -15`
Expected: typecheck clean; all tests pass (152 existing + none new from this milestone, since Task 6 added no test files)

- [ ] **Step 3: Restart the backend so Flyway applies `V29` to the running dev database**

Run:
```bash
lsof -ti:8080 | xargs -r kill 2>/dev/null; sleep 1
cd backend && nohup ./mvnw -q spring-boot:run > /tmp/eregion-backend.log 2>&1 & disown
sleep 20
curl -s -o /dev/null -w "backend: %{http_code}\n" http://localhost:8080/api/explore --max-time 5
grep -i "migrating schema" /tmp/eregion-backend.log
```
Expected: `backend: 200`; the migrate log line mentions `V29`

- [ ] **Step 4: No commit for this task — it's verification only, nothing changed**

---

## What this milestone deliberately does not include

- No `SlotAuditService`, no slot targets, no candidate-finder changes, no build-workflow UI, no `saved_search` table — all later milestones per the design doc.
- No rename of existing functional-tag categories (see the scope note at the top).
- No UI for any of this — `DeckPlan`/`BenchmarkProfile`/`RoleOverride` are reachable only via their new endpoints and hooks until the build-workflow UI (Milestone 4) gives them a page to live on.

Stop here for review before starting Milestone 2 (`SlotAuditService` + the audit UI), per the working agreement: one milestone at a time.
