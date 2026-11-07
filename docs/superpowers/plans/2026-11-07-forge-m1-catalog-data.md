# Forge M1 — Catalog data (oracle_id, edhrec_rank, oracle tags) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every catalog card its Scryfall `oracle_id` and global popularity rank (`edhrec_rank`), and load Scryfall's oracle-tags bulk file (what each card does: sac-outlet, ramp, death-trigger…) with tag ancestors expanded, so the Forge scorer (M2) can match cards by function across every set.

**Architecture:** A new weekly job `CatalogEnrichmentService` (package `io.eregion.card`) streams two official Scryfall bulk files: `oracle_cards` (to fill `cards.oracle_id` and `cards.edhrec_rank` on every existing row by name, without touching printing or art), and `oracle_tags` (one JSON line per tag, with parent ids and the oracle ids it applies to). Pure class `OracleTagClosure` expands each card's tags to include ancestors (`removal` has no direct cards, only children like `removal-creature`). `OracleTagRepository` writes metadata in batches and replaces the tag tables in one transaction. The existing `BulkCatalogSyncService` is untouched.

**Tech Stack:** Spring Boot 4 / Java 25, JdbcClient + JdbcTemplate batch, Flyway, Jackson 3 (`tools.jackson`), Testcontainers-gated tests (`PostgresTest`, skipped where Docker's API is unreachable).

**Spec:** `docs/superpowers/specs/2026-11-06-forge-design.md` (Data sources, Milestone 1).

**Verified facts (live, 2026-11-07):** `oracle_tags` bulk = gzip JSON-Lines, 4,602 lines, one per tag: `{"id","slug","label","description","parent_ids":[...],"child_ids":[...],"taggings":[{"oracle_id","weight"}]}`. 240,091 direct taggings over 36,452 cards; 441,150 rows once ancestors are added. Weights are 99.7% `"median"` and are ignored. `edhrec_rank` is a top-level integer on card objects (Sol Ring 1, Kaalia 3503), absent on some cards. Eregion stores no `oracle_id` today.

**Commits:** plain messages, NO `Co-Authored-By` trailer (project rule). Do not use `git commit -m "$(cat <<EOF…)"` — a local hook rewrites `cat`; use `-m "…"` or `-F file`.

---

## Task 0 (controller, before dispatching): workspace

Create a worktree from main HEAD and merge branch `worktree-deck-builder-milestone-1` into it (brings migration V29). This keeps migrations ordered V27, V28, V29, V30 and leaves main's uncommitted work untouched. Run `npm install` in the worktree's `frontend/` if needed. Baseline: backend suite green.

---

### Task 1: Migration V30

**Files:**
- Create: `backend/src/main/resources/db/migration/V30__oracle_tags_and_popularity.sql`
- Test: `backend/src/test/java/io/eregion/card/OracleTagMigrationTest.java`

- [ ] **Step 1: Failing test**

```java
package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;

import io.eregion.support.PostgresTest;
import org.junit.jupiter.api.Test;

class OracleTagMigrationTest extends PostgresTest {

	@Test
	void cardsGainOracleIdAndRankAndTheTagTablesExist() {
		assertThat(column("cards", "oracle_id")).isTrue();
		assertThat(column("cards", "edhrec_rank")).isTrue();
		assertThat(column("oracle_tag", "slug")).isTrue();
		assertThat(column("card_oracle_tag", "direct")).isTrue();
	}

	private static boolean column(String table, String name) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c)")
				.param("t", table).param("c", name).query(Boolean.class).single();
	}
}
```

- [ ] **Step 2: Run, expect FAIL (or SKIP without Docker — then confirm compile)**: `cd backend && ./mvnw -q -o test -Dtest=OracleTagMigrationTest`

- [ ] **Step 3: Migration**

```sql
-- What a card is across printings (Scryfall's oracle id) and how widely it is played in Commander overall
-- (Scryfall's edhrec_rank, 1 = most played). Filled weekly from the oracle-cards bulk file; null until then.
ALTER TABLE cards
    ADD COLUMN oracle_id   UUID,
    ADD COLUMN edhrec_rank INTEGER;
CREATE INDEX cards_oracle_id_idx ON cards (oracle_id);

-- Scryfall Tagger's function tags (ramp, sacrifice-outlet, death-trigger, ...), replaced weekly from the
-- oracle-tags bulk file. Keyed by oracle id, not by our card row, so a card added later picks its tags up through
-- cards.oracle_id with no backfill.
CREATE TABLE oracle_tag (
    slug        TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
);

-- direct is false when the card carries the tag only through a child tag (removal-creature makes a card removal).
CREATE TABLE card_oracle_tag (
    oracle_id UUID    NOT NULL,
    slug      TEXT    NOT NULL REFERENCES oracle_tag (slug) ON DELETE CASCADE,
    direct    BOOLEAN NOT NULL,
    PRIMARY KEY (oracle_id, slug)
);
CREATE INDEX card_oracle_tag_slug_idx ON card_oracle_tag (slug);
```

- [ ] **Step 4: Run, expect PASS/SKIP.** Also `./mvnw -q -o compile`.
- [ ] **Step 5: Commit** — `git add` both files; `git commit -m "Add oracle_id and edhrec_rank to cards, and the oracle tag tables"`

---

### Task 2: Bulk records and a generic bulk stream

**Files:**
- Create: `backend/src/main/java/io/eregion/card/ScryfallCardMeta.java`
- Create: `backend/src/main/java/io/eregion/card/ScryfallOracleTag.java`
- Modify: `backend/src/main/java/io/eregion/card/ScryfallClient.java` (the `streamBulkData` method)
- Test: `backend/src/test/java/io/eregion/card/ScryfallBulkRecordsTest.java`

- [ ] **Step 1: Failing test** (parses real-shaped lines with the same mapper style the client uses)

```java
package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

class ScryfallBulkRecordsTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Test
	void anOracleCardLineGivesNameOracleIdAndRank() {
		String line = "{\"object\":\"card\",\"name\":\"Sol Ring\",\"oracle_id\":\"6ad8011d-3471-4369-9d68-b264cc027487\",\"edhrec_rank\":1,\"set\":\"cmm\"}";

		ScryfallCardMeta meta = JSON.readValue(line, ScryfallCardMeta.class);

		assertThat(meta.name()).isEqualTo("Sol Ring");
		assertThat(meta.oracle_id()).isEqualTo("6ad8011d-3471-4369-9d68-b264cc027487");
		assertThat(meta.edhrec_rank()).isEqualTo(1);
	}

	@Test
	void aCardWithNoRankReadsAsNull() {
		ScryfallCardMeta meta = JSON.readValue("{\"name\":\"Gleemax\",\"oracle_id\":\"11111111-1111-1111-1111-111111111111\"}", ScryfallCardMeta.class);

		assertThat(meta.edhrec_rank()).isNull();
	}

	@Test
	void anOracleTagLineGivesSlugParentsAndTaggings() {
		String line = "{\"object\":\"tag\",\"id\":\"t1\",\"label\":\"removal-creature\",\"slug\":\"removal-creature\",\"type\":\"oracle\","
				+ "\"description\":\"Kills a creature.\",\"parent_ids\":[\"t0\"],\"child_ids\":[],\"aliases\":[],"
				+ "\"taggings\":[{\"oracle_id\":\"22222222-2222-2222-2222-222222222222\",\"weight\":\"median\"}]}";

		ScryfallOracleTag tag = JSON.readValue(line, ScryfallOracleTag.class);

		assertThat(tag.slug()).isEqualTo("removal-creature");
		assertThat(tag.parent_ids()).containsExactly("t0");
		assertThat(tag.taggings()).extracting(ScryfallOracleTag.Tagging::oracle_id)
				.containsExactly("22222222-2222-2222-2222-222222222222");
	}
}
```

- [ ] **Step 2: Run, expect FAIL (compile)**: `cd backend && ./mvnw -q -o test -Dtest=ScryfallBulkRecordsTest`

- [ ] **Step 3: Records**

`ScryfallCardMeta.java`:
```java
package io.eregion.card;

/** The slice of an oracle-cards bulk line the catalog enrichment reads. Unknown fields are ignored. */
@SuppressWarnings("checkstyle:MemberName")
public record ScryfallCardMeta(String name, String oracle_id, Integer edhrec_rank) {
}
```

`ScryfallOracleTag.java`:
```java
package io.eregion.card;

import java.util.List;

/** One line of Scryfall's oracle-tags bulk file: a Tagger tag, its parents, and the cards (by oracle id) it applies to. */
@SuppressWarnings("checkstyle:MemberName")
public record ScryfallOracleTag(String id, String slug, String label, String description, List<String> parent_ids, List<Tagging> taggings) {

	public record Tagging(String oracle_id) {
	}
}
```

- [ ] **Step 4: Generic stream in `ScryfallClient`.** Replace the existing `public void streamBulkData(String uri, Consumer<ScryfallCard> consumer)` with a generic version plus a delegating overload (existing callers unchanged):

```java
	/** Streams oracle-cards style bulk lines as cards. See {@link #streamBulkData(String, Class, Consumer)}. */
	public void streamBulkData(String uri, Consumer<ScryfallCard> consumer) {
		streamBulkData(uri, ScryfallCard.class, consumer);
	}

	/**
	 * Streams a bulk-data file straight from Scryfall's CDN into {@code consumer}, one line at a time, without holding
	 * the whole file in memory. The file is gzip-compressed JSON-Lines: one object per line, read as {@code type}.
	 * These downloads are not rate-limited the way the API is, so this does not go through {@link #throttle()}.
	 */
	public <T> void streamBulkData(String uri, Class<T> type, Consumer<T> consumer) {
		HttpRequest request = HttpRequest.newBuilder(URI.create(uri)).header("User-Agent", userAgent).header("Accept", "application/json").build();
		try {
			HttpResponse<InputStream> response = bulkHttp.send(request, HttpResponse.BodyHandlers.ofInputStream());
			if (response.statusCode() != 200) {
				throw new IllegalStateException("Bulk data download answered " + response.statusCode());
			}
			try (InputStream raw = response.body();
					java.util.zip.GZIPInputStream gzip = new java.util.zip.GZIPInputStream(raw);
					java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(gzip, java.nio.charset.StandardCharsets.UTF_8))) {
				String line;
				while ((line = reader.readLine()) != null) {
					if (!line.isBlank()) {
						consumer.accept(JSON.readValue(line, type));
					}
				}
			}
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("Interrupted while downloading bulk data", ex);
		}
	}
```

- [ ] **Step 5: Run test (PASS) and full suite** (`./mvnw -o test 2>&1 | grep -E "Tests run: [0-9]+, Failures.*Skipped: [0-9]+$|BUILD"`, expect BUILD SUCCESS).
- [ ] **Step 6: Commit** — `git commit -m "Read oracle-card metadata and oracle-tag lines from Scryfall bulk files"`

---

### Task 3: `OracleTagClosure` (pure)

**Files:**
- Create: `backend/src/main/java/io/eregion/card/OracleTagClosure.java`
- Test: `backend/src/test/java/io/eregion/card/OracleTagClosureTest.java`

- [ ] **Step 1: Failing test**

```java
package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import io.eregion.card.OracleTagClosure.CardTag;
import io.eregion.card.ScryfallOracleTag.Tagging;
import org.junit.jupiter.api.Test;

class OracleTagClosureTest {

	private static final String SWORDS = "33333333-3333-3333-3333-333333333333";
	private static final String WRATH = "44444444-4444-4444-4444-444444444444";

	private static ScryfallOracleTag tag(String id, String slug, List<String> parents, String... oracleIds) {
		return new ScryfallOracleTag(id, slug, slug, "", parents, java.util.Arrays.stream(oracleIds).map(Tagging::new).toList());
	}

	@Test
	void aChildTagAlsoGivesItsAncestorsAsIndirect() {
		var tags = List.of(
				tag("r", "removal", List.of()),
				tag("rc", "removal-creature", List.of("r"), SWORDS));

		List<CardTag> rows = OracleTagClosure.expand(tags);

		assertThat(rows).containsExactlyInAnyOrder(
				new CardTag(UUID.fromString(SWORDS), "removal-creature", true),
				new CardTag(UUID.fromString(SWORDS), "removal", false));
	}

	@Test
	void aDirectTagWinsOverTheSameTagReachedThroughAChild() {
		var tags = List.of(
				tag("r", "removal", List.of(), WRATH),
				tag("rc", "removal-creature", List.of("r"), WRATH));

		assertThat(OracleTagClosure.expand(tags)).containsExactlyInAnyOrder(
				new CardTag(UUID.fromString(WRATH), "removal", true),
				new CardTag(UUID.fromString(WRATH), "removal-creature", true));
	}

	@Test
	void grandparentsCountAndCyclesAndUnknownParentsAreHarmless() {
		var tags = List.of(
				tag("a", "a", List.of("c")),
				tag("b", "b", List.of("a", "missing")),
				tag("c", "c", List.of("b"), SWORDS));

		assertThat(OracleTagClosure.expand(tags)).extracting(CardTag::slug).containsExactlyInAnyOrder("c", "b", "a");
	}

	@Test
	void aTaggingWithABadOracleIdIsSkipped() {
		var tags = List.of(tag("x", "x", List.of(), "not-a-uuid", SWORDS));

		assertThat(OracleTagClosure.expand(tags)).containsExactly(new CardTag(UUID.fromString(SWORDS), "x", true));
	}
}
```

- [ ] **Step 2: Run, expect FAIL (compile)**: `./mvnw -q -o test -Dtest=OracleTagClosureTest`

- [ ] **Step 3: Implementation**

```java
package io.eregion.card;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Expands Scryfall Tagger tags into one row per (card, tag), adding every ancestor tag as an indirect row. Tagger
 * puts cards on the most specific tag (removal-creature) and leaves broad ones (removal) with few or no direct
 * cards, so without this a search for "removal" would miss nearly all removal.
 */
public final class OracleTagClosure {

	public record CardTag(UUID oracleId, String slug, boolean direct) {
	}

	private OracleTagClosure() {
	}

	public static List<CardTag> expand(List<ScryfallOracleTag> tags) {
		Map<String, ScryfallOracleTag> byId = new HashMap<>();
		tags.forEach(tag -> byId.put(tag.id(), tag));

		// Keyed by (oracle id, slug); a direct row is never downgraded by an indirect one.
		Map<String, CardTag> rows = new LinkedHashMap<>();
		for (ScryfallOracleTag tag : tags) {
			Set<String> ancestors = ancestorSlugs(tag, byId);
			for (ScryfallOracleTag.Tagging tagging : tag.taggings() == null ? List.<ScryfallOracleTag.Tagging>of() : tag.taggings()) {
				UUID oracleId = parse(tagging.oracle_id());
				if (oracleId == null) {
					continue;
				}
				put(rows, new CardTag(oracleId, tag.slug(), true));
				ancestors.forEach(slug -> put(rows, new CardTag(oracleId, slug, false)));
			}
		}
		return new ArrayList<>(rows.values());
	}

	private static void put(Map<String, CardTag> rows, CardTag row) {
		String key = row.oracleId() + "|" + row.slug();
		CardTag existing = rows.get(key);
		if (existing == null || (!existing.direct() && row.direct())) {
			rows.put(key, row);
		}
	}

	/** Every tag above this one, following parent ids breadth-first; unknown ids and cycles are skipped. */
	private static Set<String> ancestorSlugs(ScryfallOracleTag start, Map<String, ScryfallOracleTag> byId) {
		Set<String> seenIds = new LinkedHashSet<>();
		seenIds.add(start.id());
		Set<String> slugs = new LinkedHashSet<>();
		Deque<String> queue = new ArrayDeque<>(start.parent_ids() == null ? List.of() : start.parent_ids());
		while (!queue.isEmpty()) {
			String id = queue.poll();
			ScryfallOracleTag parent = byId.get(id);
			if (parent == null || !seenIds.add(id)) {
				continue;
			}
			if (!parent.slug().equals(start.slug())) {
				slugs.add(parent.slug());
			}
			if (parent.parent_ids() != null) {
				queue.addAll(parent.parent_ids());
			}
		}
		return slugs;
	}

	private static UUID parse(String value) {
		try {
			return value == null ? null : UUID.fromString(value);
		}
		catch (IllegalArgumentException ex) {
			return null;
		}
	}
}
```

- [ ] **Step 4: Run, expect PASS** (these are pure tests — they really run, no Docker needed).
- [ ] **Step 5: Commit** — `git commit -m "Expand Tagger tags to include each tag's ancestors"`

---

### Task 4: `OracleTagRepository`

**Files:**
- Create: `backend/src/main/java/io/eregion/card/OracleTagRepository.java`
- Test: `backend/src/test/java/io/eregion/card/OracleTagRepositoryTest.java`

- [ ] **Step 1: Failing test** (PostgresTest; skips without Docker)

```java
package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import io.eregion.card.OracleTagClosure.CardTag;
import io.eregion.support.PostgresTest;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class OracleTagRepositoryTest extends PostgresTest {

	private final OracleTagRepository repository = new OracleTagRepository(jdbc, new JdbcTemplate(dataSource));

	@Test
	void metadataIsFilledByNameWithoutTouchingThePrinting() {
		UUID scryfallId = UUID.randomUUID();
		UUID cardId = newCard("Enrich Me", scryfallId);
		UUID oracleId = UUID.randomUUID();

		repository.updateCardMetadata(List.of(new ScryfallCardMeta("enrich me", oracleId.toString(), 42)));

		var row = jdbc.sql("SELECT scryfall_id, oracle_id, edhrec_rank FROM cards WHERE id = :id").param("id", cardId)
				.query((rs, n) -> List.of(rs.getObject(1), rs.getObject(2), rs.getInt(3))).single();
		assertThat(row).containsExactly(scryfallId, oracleId, 42);
	}

	@Test
	void replacingTagsSwapsTheWholeSetAndCardsFindTheirTagsThroughOracleId() {
		UUID oracleId = UUID.randomUUID();
		UUID cardId = newCard("Tagged Card", UUID.randomUUID());
		repository.updateCardMetadata(List.of(new ScryfallCardMeta("Tagged Card", oracleId.toString(), null)));

		repository.replaceTags(
				List.of(new ScryfallOracleTag("t1", "old-tag", "old-tag", "", List.of(), List.of())),
				List.of(new CardTag(oracleId, "old-tag", true)));
		repository.replaceTags(
				List.of(new ScryfallOracleTag("t2", "removal", "removal", "Removes things.", List.of(), List.of()),
						new ScryfallOracleTag("t3", "removal-creature", "removal-creature", null, List.of(), List.of())),
				List.of(new CardTag(oracleId, "removal-creature", true), new CardTag(oracleId, "removal", false)));

		assertThat(repository.tagsForCards(List.of(cardId)).get(cardId)).containsExactlyInAnyOrder("removal", "removal-creature");
		assertThat(repository.countCardTags()).isEqualTo(2);
	}

	private static UUID newCard(String name, UUID scryfallId) {
		return jdbc.sql("""
				INSERT INTO cards (scryfall_id, name, mana_cost, mana_value, type_line, primary_type, colors, color_identity,
				                    oracle_text, power, toughness, set_code, set_name, collector_number, rarity, artist,
				                    image_small, image_normal, image_art_crop, commander_legality)
				VALUES (:sid, :name, '', 0, 'Instant', 'Instant', '', '', '', '', '', 'tst', 'Test', '1',
				        'common', '', '', '', '', 'legal')
				RETURNING id
				""").param("sid", scryfallId).param("name", name).query(UUID.class).single();
	}
}
```

- [ ] **Step 2: Run, expect FAIL (compile)**: `./mvnw -q -o test -Dtest=OracleTagRepositoryTest`

- [ ] **Step 3: Implementation**

```java
package io.eregion.card;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import io.eregion.card.OracleTagClosure.CardTag;

@Repository
public class OracleTagRepository {

	private static final int BATCH = 1000;
	private static final int CHUNK = 500;

	private final JdbcClient jdbc;
	private final JdbcTemplate template;

	public OracleTagRepository(JdbcClient jdbc, JdbcTemplate template) {
		this.jdbc = jdbc;
		this.template = template;
	}

	/** Sets oracle id and popularity on the card with each name. Printing, art and prices are left as they are. */
	public void updateCardMetadata(List<ScryfallCardMeta> metas) {
		List<ScryfallCardMeta> usable = metas.stream().filter(meta -> meta.name() != null && parse(meta.oracle_id()) != null).toList();
		for (int start = 0; start < usable.size(); start += BATCH) {
			List<ScryfallCardMeta> chunk = usable.subList(start, Math.min(start + BATCH, usable.size()));
			template.batchUpdate("UPDATE cards SET oracle_id = ?, edhrec_rank = ? WHERE lower(name) = lower(?)", new BatchPreparedStatementSetter() {
				@Override
				public void setValues(PreparedStatement ps, int i) throws SQLException {
					ScryfallCardMeta meta = chunk.get(i);
					ps.setObject(1, parse(meta.oracle_id()));
					if (meta.edhrec_rank() == null) {
						ps.setNull(2, java.sql.Types.INTEGER);
					}
					else {
						ps.setInt(2, meta.edhrec_rank());
					}
					ps.setString(3, meta.name());
				}

				@Override
				public int getBatchSize() {
					return chunk.size();
				}
			});
		}
	}

	/** Replaces every tag and tagging in one transaction, so readers see the old set or the new one, never neither. */
	@Transactional
	public void replaceTags(List<ScryfallOracleTag> tags, List<CardTag> rows) {
		jdbc.sql("DELETE FROM card_oracle_tag").update();
		jdbc.sql("DELETE FROM oracle_tag").update();
		List<ScryfallOracleTag> unique = new ArrayList<>(tags.stream()
				.collect(java.util.stream.Collectors.toMap(ScryfallOracleTag::slug, tag -> tag, (first, second) -> first, java.util.LinkedHashMap::new))
				.values());
		for (int start = 0; start < unique.size(); start += BATCH) {
			List<ScryfallOracleTag> chunk = unique.subList(start, Math.min(start + BATCH, unique.size()));
			template.batchUpdate("INSERT INTO oracle_tag (slug, label, description) VALUES (?, ?, ?)", new BatchPreparedStatementSetter() {
				@Override
				public void setValues(PreparedStatement ps, int i) throws SQLException {
					ScryfallOracleTag tag = chunk.get(i);
					ps.setString(1, tag.slug());
					ps.setString(2, tag.label() == null ? tag.slug() : tag.label());
					ps.setString(3, tag.description() == null ? "" : tag.description());
				}

				@Override
				public int getBatchSize() {
					return chunk.size();
				}
			});
		}
		for (int start = 0; start < rows.size(); start += BATCH) {
			List<CardTag> chunk = rows.subList(start, Math.min(start + BATCH, rows.size()));
			template.batchUpdate("INSERT INTO card_oracle_tag (oracle_id, slug, direct) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
					new BatchPreparedStatementSetter() {
						@Override
						public void setValues(PreparedStatement ps, int i) throws SQLException {
							CardTag row = chunk.get(i);
							ps.setObject(1, row.oracleId());
							ps.setString(2, row.slug());
							ps.setBoolean(3, row.direct());
						}

						@Override
						public int getBatchSize() {
							return chunk.size();
						}
					});
		}
	}

	/** Each card's tags (direct and inherited), by our card id. Cards with no oracle id yet have none. */
	public Map<UUID, List<String>> tagsForCards(Collection<UUID> cardIds) {
		Map<UUID, List<String>> result = new HashMap<>();
		List<UUID> ids = new ArrayList<>(cardIds);
		for (int start = 0; start < ids.size(); start += CHUNK) {
			jdbc.sql("""
					SELECT c.id, t.slug FROM cards c
					  JOIN card_oracle_tag t ON t.oracle_id = c.oracle_id
					 WHERE c.id IN (:ids)
					""")
					.param("ids", ids.subList(start, Math.min(start + CHUNK, ids.size())))
					.query((rs, n) -> {
						result.computeIfAbsent(rs.getObject(1, UUID.class), key -> new ArrayList<>()).add(rs.getString(2));
						return null;
					})
					.list();
		}
		return result;
	}

	public int countCardTags() {
		return jdbc.sql("SELECT COUNT(*) FROM card_oracle_tag").query(Integer.class).single();
	}

	private static UUID parse(String value) {
		try {
			return value == null ? null : UUID.fromString(value);
		}
		catch (IllegalArgumentException ex) {
			return null;
		}
	}
}
```

- [ ] **Step 4: Run (PASS/SKIP) + compile.**
- [ ] **Step 5: Commit** — `git commit -m "Store card metadata and oracle tags from the bulk files"`

---

### Task 5: `CatalogEnrichmentService` (weekly job)

**Files:**
- Create: `backend/src/main/java/io/eregion/card/CatalogEnrichmentService.java`
- Modify: `backend/src/main/resources/application.properties` (add a block after the `eregion.bulk-catalog.*` block)
- Test: `backend/src/test/java/io/eregion/card/CatalogEnrichmentServiceTest.java`

- [ ] **Step 1: Failing test** (stub client, real repository; PostgresTest)

```java
package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

import io.eregion.common.AdvisoryLock;
import io.eregion.common.AppSyncStateRepository;
import io.eregion.support.PostgresTest;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class CatalogEnrichmentServiceTest extends PostgresTest {

	private static final String ORACLE = "55555555-5555-5555-5555-555555555555";

	/** Serves two tiny bulk files instead of downloading the real ones. */
	private static final class StubClient extends ScryfallClient {
		StubClient() {
			super("eregion-test", 0);
		}

		@Override
		public String bulkDataUri(String type) {
			return type;
		}

		@Override
		@SuppressWarnings("unchecked")
		public <T> void streamBulkData(String uri, Class<T> type, Consumer<T> consumer) {
			if (uri.equals("oracle_cards")) {
				consumer.accept((T) new ScryfallCardMeta("Enrichment Target", ORACLE, 7));
			}
			else {
				consumer.accept((T) new ScryfallOracleTag("p", "ramp", "ramp", "", List.of(), List.of()));
				consumer.accept((T) new ScryfallOracleTag("c", "mana-rock", "mana-rock", "", List.of("p"),
						List.of(new ScryfallOracleTag.Tagging(ORACLE))));
			}
		}
	}

	private CatalogEnrichmentService service(int minCards, int minTags) {
		return new CatalogEnrichmentService(new StubClient(), new OracleTagRepository(jdbc, new JdbcTemplate(dataSource)),
				new AppSyncStateRepository(jdbc), new AdvisoryLock(dataSource), true, 168, minCards, minTags);
	}

	@Test
	void aSyncFillsMetadataAndTagsTheCardWithItsTagAndTheAncestor() {
		UUID cardId = jdbc.sql("""
				INSERT INTO cards (scryfall_id, name, mana_cost, mana_value, type_line, primary_type, colors, color_identity,
				                    oracle_text, power, toughness, set_code, set_name, collector_number, rarity, artist,
				                    image_small, image_normal, image_art_crop, commander_legality)
				VALUES (gen_random_uuid(), 'Enrichment Target', '', 0, 'Artifact', 'Artifact', '', '', '', '', '', 'tst', 'Test', '1',
				        'common', '', '', '', '', 'legal')
				RETURNING id
				""").query(UUID.class).single();

		service(1, 1).sync();

		assertThat(jdbc.sql("SELECT edhrec_rank FROM cards WHERE id = :id").param("id", cardId).query(Integer.class).single()).isEqualTo(7);
		assertThat(new OracleTagRepository(jdbc, new JdbcTemplate(dataSource)).tagsForCards(List.of(cardId)).get(cardId))
				.containsExactlyInAnyOrder("mana-rock", "ramp");
	}

	@Test
	void anImplausiblySmallDownloadIsRefusedAndNothingIsReplaced() {
		assertThatThrownBy(() -> service(1000, 1).sync()).isInstanceOf(IllegalStateException.class);
	}
}
```

- [ ] **Step 2: Run, expect FAIL (compile)**: `./mvnw -q -o test -Dtest=CatalogEnrichmentServiceTest`

- [ ] **Step 3: Implementation.** First read `backend/src/main/java/io/eregion/card/BulkCatalogSyncService.java` (on this branch; committed in 8b646b5) and mirror its scheduling/guard style. Advisory lock keys in use: `…_01L` functional tags, `…_02L` bracket flags, `…_03L` price refresh, `…_04L` bulk catalog, `…_05L` benchmark seed — use `…_06L`.

```java
package io.eregion.card;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import io.eregion.common.AdvisoryLock;
import io.eregion.common.AppSyncStateRepository;

/**
 * Once a week, reads two Scryfall bulk files: oracle-cards, to give every catalog card its oracle id and Commander
 * popularity rank (edhrec_rank, global, 1 = most played), and oracle-tags, Tagger's record of what each card does.
 * The Forge scorer matches cards by these tags and uses the rank as a light prior. The cards' printings and art are
 * never changed here; the bulk catalog job owns which cards exist.
 */
@Service
public class CatalogEnrichmentService {

	private static final String JOB = "catalog-enrichment";
	private static final long LOCK_KEY = 0x45726567_06L;
	private static final Logger log = LoggerFactory.getLogger(CatalogEnrichmentService.class);

	private final ScryfallClient scryfall;
	private final OracleTagRepository repository;
	private final AppSyncStateRepository syncState;
	private final AdvisoryLock lock;
	private final boolean enabled;
	private final int minAgeHours;
	private final int minCards;
	private final int minTags;

	public CatalogEnrichmentService(ScryfallClient scryfall, OracleTagRepository repository, AppSyncStateRepository syncState, AdvisoryLock lock,
			@Value("${eregion.catalog-enrichment.enabled:true}") boolean enabled,
			@Value("${eregion.catalog-enrichment.min-age-hours:168}") int minAgeHours,
			@Value("${eregion.catalog-enrichment.min-cards:20000}") int minCards,
			@Value("${eregion.catalog-enrichment.min-tags:1000}") int minTags) {
		this.scryfall = scryfall;
		this.repository = repository;
		this.syncState = syncState;
		this.lock = lock;
		this.enabled = enabled;
		this.minAgeHours = minAgeHours;
		this.minCards = minCards;
		this.minTags = minTags;
	}

	@Scheduled(initialDelayString = "${eregion.catalog-enrichment.initial-delay-ms:240000}", fixedDelayString = "${eregion.catalog-enrichment.every-ms:86400000}")
	public void scheduled() {
		if (!enabled) {
			return;
		}
		try {
			boolean ran = lock.runIfFree(LOCK_KEY, () -> {
				boolean fresh = syncState.lastSynced(JOB).map(at -> Duration.between(at, Instant.now()).toHours() < minAgeHours).orElse(false);
				if (!fresh) {
					sync();
				}
			});
			if (!ran) {
				log.info("Catalog enrichment skipped: another server is running it");
			}
		}
		catch (RuntimeException ex) {
			// A failed run keeps the last good metadata and tags and tries again at the next interval.
			log.warn("Catalog enrichment failed", ex);
		}
	}

	/** Reads both files, refuses an implausibly small one, then writes. Nothing is written until both have been read. */
	public void sync() {
		Instant start = Instant.now();
		List<ScryfallCardMeta> metas = new ArrayList<>();
		scryfall.streamBulkData(scryfall.bulkDataUri("oracle_cards"), ScryfallCardMeta.class, metas::add);
		List<ScryfallOracleTag> tags = new ArrayList<>();
		scryfall.streamBulkData(scryfall.bulkDataUri("oracle_tags"), ScryfallOracleTag.class, tags::add);
		if (metas.size() < minCards || tags.size() < minTags) {
			throw new IllegalStateException("Only " + metas.size() + " cards and " + tags.size() + " tags came back, not replacing anything");
		}
		List<OracleTagClosure.CardTag> rows = OracleTagClosure.expand(tags);
		repository.updateCardMetadata(metas);
		repository.replaceTags(tags, rows);
		syncState.recordRun(JOB);
		log.info("Catalog enrichment: {} cards, {} tags, {} card tags in {} s", metas.size(), tags.size(), rows.size(),
				Duration.between(start, Instant.now()).toSeconds());
	}
}
```

Properties block (append after the `eregion.bulk-catalog.*` lines):
```properties
# Oracle ids, Commander popularity rank and Scryfall Tagger function tags, from two official bulk files, weekly.
# Feeds the Forge scorer. Runs a minute after the bulk catalog so newly added cards get their tags the same day.
eregion.catalog-enrichment.enabled=true
eregion.catalog-enrichment.initial-delay-ms=240000
eregion.catalog-enrichment.every-ms=86400000
eregion.catalog-enrichment.min-age-hours=168
```

- [ ] **Step 4: Run test (PASS/SKIP), full suite BUILD SUCCESS.**
- [ ] **Step 5: Commit** — `git commit -m "Add the weekly catalog enrichment job: oracle ids, popularity rank, oracle tags"`

---

### Task 6 (controller): live run against a throwaway database

Never against the shared dev database: it would apply V29/V30 there and the main checkout (which lacks them) would then refuse to start.

- Start `postgres:17-alpine` via the Docker CLI on a free port with db/user/password `eregion`.
- Run the worktree backend against it on a free port (e.g. 8091) with `--eregion.bulk-catalog.initial-delay-ms=5000 --eregion.catalog-enrichment.initial-delay-ms=60000 --eregion.prices.initial-delay-ms=3600000 --eregion.functional-tags.enabled=false --eregion.bracket-flags.enabled=false` and `EREGION_DB_URL` pointing at it.
- Wait for both "Bulk catalog sync:" and "Catalog enrichment:" log lines (or failures).
- Check with psql: share of cards with `oracle_id` (expect ~all), `edhrec_rank` for Sol Ring = 1, `COUNT(*) FROM card_oracle_tag` ≈ 441k, and Kaalia of the Vast's and Swords to Plowshares' tags (expect `removal` among Swords').
- Stop the backend and remove the container.

---

## Self-review notes

- Spec coverage (M1 = "edhrec_rank column + mapper; oracle_tags bulk load; tests"): covered by Tasks 1–5. Design change from spec: rank and oracle id are filled by the new enrichment job rather than the card mapper, because the bulk catalog is insert-only (existing rows would never get them) and the mapper's record is constructed positionally in many tests.
- Not in this milestone: cards added later by name search/import get oracle id and rank at the next weekly run (acceptable for a prior); the scorer that reads tags (M2).
