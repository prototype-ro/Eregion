package io.eregion.deck;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import io.eregion.deck.DeckDtos.DeckCardInput;
import io.eregion.deck.DeckDtos.DeckCardLine;
import io.eregion.deck.DeckDtos.VersionSummary;

@Repository
public class DeckRepository {

	public record DeckRow(UUID id, UUID ownerId, String name, String format, Instant createdAt, Instant updatedAt,
			String visibility, Integer publishedVersion) {
	}

	/** A version plus where it sits in the branch graph. head is true when nothing newer is on its branch. */
	public record VersionRow(UUID id, int number, String note, Instant createdAt, UUID branchId, String branchName,
			Integer parentVersion, boolean head, UUID parentId, boolean main) {
	}

	public record CustomOwner(UUID userId, UUID cardId) {
	}

	public record BranchRow(UUID id, String name, Integer forkedFromVersion, boolean main) {
	}

	private static final String VERSION_SELECT = """
			SELECT v.id, v.version_number, v.note, v.created_at, v.branch_id, b.name AS branch_name,
			       v.parent_version_id, b.is_main,
			       (SELECT p.version_number FROM deck_versions p WHERE p.id = v.parent_version_id) AS parent_number,
			       (v.version_number = (SELECT MAX(x.version_number) FROM deck_versions x
			                             WHERE x.branch_id = v.branch_id)) AS is_head
			  FROM deck_versions v
			  JOIN deck_branches b ON b.id = v.branch_id
			""";

	private final JdbcClient jdbc;
	private final JdbcTemplate template;

	public DeckRepository(JdbcClient jdbc, JdbcTemplate template) {
		this.jdbc = jdbc;
		this.template = template;
	}

	// ---- decks ----

	public UUID insertDeck(UUID ownerId, String name, String format) {
		return jdbc.sql("INSERT INTO decks (owner_id, name, format) VALUES (:owner, :name, :format) RETURNING id")
				.param("owner", ownerId)
				.param("name", name)
				.param("format", format)
				.query(UUID.class)
				.single();
	}

	/** Only returns the deck when it belongs to the user, so a stranger's id looks like a missing one. */
	public Optional<DeckRow> findOwned(UUID deckId, UUID ownerId) {
		return jdbc.sql("""
				SELECT d.id, d.owner_id, d.name, d.format, d.created_at, d.updated_at, d.visibility,
				       (SELECT p.version_number FROM deck_versions p WHERE p.id = d.published_version_id) AS published_version
				  FROM decks d WHERE d.id = :id AND d.owner_id = :owner
				""")
				.param("id", deckId)
				.param("owner", ownerId)
				.query((rs, n) -> new DeckRow(
						rs.getObject("id", UUID.class),
						rs.getObject("owner_id", UUID.class),
						rs.getString("name"),
						rs.getString("format"),
						rs.getTimestamp("created_at").toInstant(),
						rs.getTimestamp("updated_at").toInstant(),
						rs.getString("visibility"),
						(Integer) rs.getObject("published_version")))
				.optional();
	}

	/** What the decks page needs about one deck before legality is worked out. */
	public record SummaryRow(UUID id, String name, String format, int latestVersion, UUID latestVersionId, String latestBranch,
			boolean latestOnMain, int versionCount, int branchCount, int cardCount, double priceUsd, String commanderName,
			List<String> artUrls, Instant updatedAt, String visibility, Integer publishedVersion, boolean pinned, boolean archived) {
	}

	/** Every deck of a player with the facts about its latest version, in one query. */
	public List<SummaryRow> summaryRows(UUID ownerId) {
		return jdbc.sql("""
				SELECT d.id, d.name, d.format, d.updated_at, d.visibility, d.pinned, d.archived,
				       (SELECT p.version_number FROM deck_versions p WHERE p.id = d.published_version_id) AS published_version,
				       v.id AS latest_id, COALESCE(v.version_number, 0) AS latest_version,
				       b.name AS latest_branch, COALESCE(b.is_main, TRUE) AS latest_main,
				       (SELECT COUNT(*) FROM deck_versions x WHERE x.deck_id = d.id) AS version_count,
				       (SELECT COUNT(*) FROM deck_branches y WHERE y.deck_id = d.id) AS branch_count,
				       COALESCE((SELECT SUM(dc.quantity) FROM deck_version_cards dc
				                  WHERE dc.version_id = v.id AND dc.board IN ('commander', 'main')), 0) AS card_count,
				       COALESCE((SELECT SUM(COALESCE(CASE WHEN p.scryfall_id IS NOT NULL THEN p.price_usd ELSE c.price_usd END, 0) * dc.quantity)
				                   FROM deck_version_cards dc JOIN cards c ON c.id = dc.card_id
				                   LEFT JOIN card_printings p ON p.scryfall_id = dc.printing_id
				                  WHERE dc.version_id = v.id AND dc.board IN ('commander', 'main')), 0) AS price,
				       (SELECT string_agg(c.name, ' + ' ORDER BY c.name) FROM deck_version_cards dc JOIN cards c ON c.id = dc.card_id
				         WHERE dc.version_id = v.id AND dc.board = 'commander') AS commander_name,
				       (SELECT array_agg(a.art ORDER BY a.name) FROM (
				            SELECT c.name, c.image_art_crop AS art FROM deck_version_cards dc JOIN cards c ON c.id = dc.card_id
				             WHERE dc.version_id = v.id AND dc.board = 'commander' AND c.image_art_crop <> '' LIMIT 2) a) AS arts
				  FROM decks d
				  LEFT JOIN LATERAL (SELECT id, version_number, branch_id FROM deck_versions
				                      WHERE deck_id = d.id ORDER BY version_number DESC LIMIT 1) v ON TRUE
				  LEFT JOIN deck_branches b ON b.id = v.branch_id
				 WHERE d.owner_id = :owner
				 ORDER BY d.updated_at DESC
				""")
				.param("owner", ownerId)
				.query((rs, n) -> {
					java.sql.Array arts = rs.getArray("arts");
					return new SummaryRow(
							rs.getObject("id", UUID.class),
							rs.getString("name"),
							rs.getString("format"),
							rs.getInt("latest_version"),
							rs.getObject("latest_id", UUID.class),
							rs.getString("latest_branch"),
							rs.getBoolean("latest_main"),
							rs.getInt("version_count"),
							rs.getInt("branch_count"),
							rs.getInt("card_count"),
							rs.getDouble("price"),
							rs.getString("commander_name"),
							arts == null ? List.of() : List.of((String[]) arts.getArray()),
							rs.getTimestamp("updated_at").toInstant(),
							rs.getString("visibility"),
							(Integer) rs.getObject("published_version"),
							rs.getBoolean("pinned"),
							rs.getBoolean("archived"));
				})
				.list();
	}

	/** The commander and main board cards of these versions, with what is needed to judge legality. */
	public Map<UUID, List<DeckLegality.Line>> legalityLines(Collection<UUID> versionIds) {
		if (versionIds.isEmpty()) {
			return Map.of();
		}
		Map<UUID, List<DeckLegality.Line>> result = new HashMap<>();
		jdbc.sql("""
				SELECT dc.version_id, c.id AS card_id, c.name, dc.board, dc.quantity, c.color_identity, c.type_line, c.oracle_text
				  FROM deck_version_cards dc JOIN cards c ON c.id = dc.card_id
				 WHERE dc.version_id IN (:ids) AND dc.board IN ('commander', 'main')
				""")
				.param("ids", versionIds)
				.query((rs, n) -> {
					result.computeIfAbsent(rs.getObject("version_id", UUID.class), key -> new java.util.ArrayList<>()).add(
							new DeckLegality.Line(rs.getObject("card_id", UUID.class), rs.getString("name"), rs.getString("board"),
									rs.getInt("quantity"), rs.getString("color_identity"), rs.getString("type_line"), rs.getString("oracle_text")));
					return null;
				})
				.list();
		return result;
	}

	/** Sets the flags that are not null. Pinning and archiving are not edits, so the edited time stays. */
	public DeckDtos.DeckFlags updateFlags(UUID deckId, Boolean pinned, Boolean archived) {
		return jdbc.sql("""
				UPDATE decks SET pinned = COALESCE(CAST(:pinned AS boolean), pinned), archived = COALESCE(CAST(:archived AS boolean), archived)
				 WHERE id = :id RETURNING pinned, archived
				""")
				.param("id", deckId)
				.param("pinned", pinned)
				.param("archived", archived)
				.query((rs, n) -> new DeckDtos.DeckFlags(rs.getBoolean("pinned"), rs.getBoolean("archived")))
				.single();
	}

	public List<UUID> deckIds(UUID ownerId) {
		return jdbc.sql("SELECT id FROM decks WHERE owner_id = :owner").param("owner", ownerId).query(UUID.class).list();
	}

	public void renameDeck(UUID deckId, String name) {
		jdbc.sql("UPDATE decks SET name = :name, updated_at = now() WHERE id = :id").param("id", deckId).param("name", name).update();
	}

	/** Shows the given version to everyone, or hides the deck again when versionId is null. */
	public void setPublished(UUID deckId, UUID versionId) {
		jdbc.sql("""
				UPDATE decks
				   SET visibility = CASE WHEN CAST(:version AS uuid) IS NULL THEN 'private' ELSE 'public' END,
				       published_version_id = CAST(:version AS uuid),
				       published_at = CASE WHEN CAST(:version AS uuid) IS NULL THEN NULL ELSE now() END
				 WHERE id = :id
				""")
				.param("id", deckId)
				.param("version", versionId)
				.update();
	}

	public void touch(UUID deckId) {
		jdbc.sql("UPDATE decks SET updated_at = now() WHERE id = :id").param("id", deckId).update();
	}

	public void delete(UUID deckId) {
		// Versions point at each other and at branches, so clear those links before the cascade.
		jdbc.sql("UPDATE decks SET visibility = 'private', published_version_id = NULL, published_at = NULL WHERE id = :id").param("id", deckId).update();
		jdbc.sql("UPDATE deck_versions SET parent_version_id = NULL, merge_parent_version_id = NULL WHERE deck_id = :id").param("id", deckId).update();
		jdbc.sql("UPDATE deck_branches SET forked_from_version_id = NULL WHERE deck_id = :id").param("id", deckId).update();
		jdbc.sql("DELETE FROM decks WHERE id = :id").param("id", deckId).update();
	}

	// ---- branches ----

	public UUID insertBranch(UUID deckId, String name, UUID forkedFromVersionId) {
		return jdbc.sql("""
				INSERT INTO deck_branches (deck_id, name, forked_from_version_id)
				VALUES (:deck, :name, :fork) RETURNING id
				""")
				.param("deck", deckId)
				.param("name", name)
				.param("fork", forkedFromVersionId)
				.query(UUID.class)
				.single();
	}

	public UUID insertMainBranch(UUID deckId, String name) {
		return jdbc.sql("INSERT INTO deck_branches (deck_id, name, is_main) VALUES (:deck, :name, TRUE) RETURNING id")
				.param("deck", deckId)
				.param("name", name)
				.query(UUID.class)
				.single();
	}

	public Optional<UUID> findMainBranchId(UUID deckId) {
		return jdbc.sql("SELECT id FROM deck_branches WHERE deck_id = :deck AND is_main")
				.param("deck", deckId)
				.query(UUID.class)
				.optional();
	}

	/** The newest version on a branch. */
	public Optional<VersionRow> branchHead(UUID branchId) {
		return jdbc.sql(VERSION_SELECT + " WHERE v.branch_id = :branch ORDER BY v.version_number DESC LIMIT 1")
				.param("branch", branchId)
				.query(DeckRepository::mapVersion)
				.optional();
	}

	public int versionCount(UUID deckId) {
		return jdbc.sql("SELECT COUNT(*) FROM deck_versions WHERE deck_id = :deck").param("deck", deckId).query(Integer.class).single();
	}

	public int branchVersionCount(UUID branchId) {
		return jdbc.sql("SELECT COUNT(*) FROM deck_versions WHERE branch_id = :b").param("b", branchId).query(Integer.class).single();
	}

	/** True when this exact version is the one shown on Explore. */
	public boolean isPublished(UUID deckId, UUID versionId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM decks WHERE id = :deck AND published_version_id = :v)")
				.param("deck", deckId).param("v", versionId).query(Boolean.class).single();
	}

	/**
	 * Takes one version out of the history. Whatever pointed at it (child versions, merge links and branch
	 * fork points) now points at its parent instead, so the line stays connected. The caller decides
	 * whether the deletion is allowed.
	 */
	public void deleteVersion(UUID versionId, UUID parentId) {
		// Detach it first: its children are about to take its parent, and a parent can have only one child per branch.
		jdbc.sql("UPDATE deck_versions SET parent_version_id = NULL WHERE id = :v").param("v", versionId).update();
		jdbc.sql("UPDATE deck_versions SET parent_version_id = :parent WHERE parent_version_id = :v")
				.param("parent", parentId).param("v", versionId).update();
		jdbc.sql("UPDATE deck_versions SET merge_parent_version_id = :parent WHERE merge_parent_version_id = :v")
				.param("parent", parentId).param("v", versionId).update();
		jdbc.sql("UPDATE deck_branches SET forked_from_version_id = :parent WHERE forked_from_version_id = :v")
				.param("parent", parentId).param("v", versionId).update();
		jdbc.sql("DELETE FROM deck_versions WHERE id = :v").param("v", versionId).update();
	}

	/** True when another version, a merge or a branch starts from this version, so changing it would rewrite what they grew from. */
	public boolean hasDependents(UUID versionId) {
		return jdbc.sql("""
				SELECT EXISTS (SELECT 1 FROM deck_versions WHERE parent_version_id = :v OR merge_parent_version_id = :v)
				    OR EXISTS (SELECT 1 FROM deck_branches WHERE forked_from_version_id = :v)
				""").param("v", versionId).query(Boolean.class).single();
	}

	/** Swaps all the cards of a version for new ones. */
	public void replaceVersionCards(UUID versionId, List<DeckCardInput> cards) {
		jdbc.sql("DELETE FROM deck_version_cards WHERE version_id = :v").param("v", versionId).update();
		insertVersionCards(versionId, cards);
	}

	public void deleteEmptyBranch(UUID branchId) {
		jdbc.sql("DELETE FROM deck_branches WHERE id = :id").param("id", branchId).update();
	}

	public void updateNote(UUID versionId, String note) {
		jdbc.sql("UPDATE deck_versions SET note = :note WHERE id = :id").param("id", versionId).param("note", note).update();
	}

	/** Where a card sits in every version of a deck, oldest first. Versions without the card are not listed. */
	public List<DeckDtos.CardAppearance> cardHistory(UUID deckId, UUID cardId) {
		return jdbc.sql("""
				SELECT v.version_number, dc.board, dc.quantity, dc.tags,
				       CASE WHEN cp.id IS NOT NULL THEN 'Custom: ' || cp.label
				            ELSE trim(COALESCE(p.set_code, c.set_code) || ' ' || COALESCE(p.collector_number, c.collector_number)) END AS printing
				  FROM deck_versions v
				  JOIN deck_version_cards dc ON dc.version_id = v.id AND dc.card_id = :card
				  JOIN cards c ON c.id = dc.card_id
				  LEFT JOIN card_printings p ON p.scryfall_id = dc.printing_id
				  LEFT JOIN custom_printings cp ON cp.id = dc.custom_printing_id
				 WHERE v.deck_id = :deck
				 ORDER BY v.version_number, dc.board
				""")
				.param("deck", deckId)
				.param("card", cardId)
				.query((rs, n) -> {
					java.sql.Array tags = rs.getArray("tags");
					return new DeckDtos.CardAppearance(rs.getInt("version_number"), rs.getString("board"), rs.getInt("quantity"),
							rs.getString("printing"), tags == null ? List.of() : List.of((String[]) tags.getArray()));
				})
				.list();
	}

	/** A version and every version it grew from, through parents and merges, with their numbers. */
	public Map<UUID, Integer> ancestors(UUID versionId) {
		Map<UUID, Integer> result = new HashMap<>();
		jdbc.sql("""
				WITH RECURSIVE a(id) AS (
				    SELECT CAST(:v AS uuid)
				    UNION
				    SELECT p.pid FROM a
				      JOIN deck_versions x ON x.id = a.id
				      CROSS JOIN LATERAL (VALUES (x.parent_version_id), (x.merge_parent_version_id)) AS p(pid)
				     WHERE p.pid IS NOT NULL)
				SELECT v.id, v.version_number FROM a JOIN deck_versions v ON v.id = a.id
				""")
				.param("v", versionId)
				.query((rs, n) -> {
					result.put(rs.getObject("id", UUID.class), rs.getInt("version_number"));
					return null;
				})
				.list();
		return result;
	}

	public void renameBranch(UUID branchId, String name) {
		jdbc.sql("UPDATE deck_branches SET name = :name WHERE id = :id").param("id", branchId).param("name", name).update();
	}

	/** Branches that split off from a version inside this branch. Deleting it would orphan them. */
	public List<String> branchesForkedFrom(UUID branchId) {
		return jdbc.sql("""
				SELECT b.name FROM deck_branches b
				  JOIN deck_versions v ON v.id = b.forked_from_version_id
				 WHERE v.branch_id = :id AND b.id <> :id
				 ORDER BY b.name
				""").param("id", branchId).query(String.class).list();
	}

	/** True when the deck's public version is one of this branch's versions. */
	public boolean publishesFrom(UUID deckId, UUID branchId) {
		return jdbc.sql("""
				SELECT EXISTS (SELECT 1 FROM decks d JOIN deck_versions v ON v.id = d.published_version_id
				                WHERE d.id = :deck AND v.branch_id = :branch)
				""").param("deck", deckId).param("branch", branchId).query(Boolean.class).single();
	}

	/** Removes a branch and every version on it. Callers check nothing else depends on them first. */
	public void deleteBranch(UUID branchId) {
		jdbc.sql("UPDATE deck_versions SET parent_version_id = NULL WHERE branch_id = :id").param("id", branchId).update();
		jdbc.sql("DELETE FROM deck_versions WHERE branch_id = :id").param("id", branchId).update();
		jdbc.sql("DELETE FROM deck_branches WHERE id = :id").param("id", branchId).update();
	}

	public Optional<UUID> findBranchId(UUID deckId, String name) {
		return jdbc.sql("SELECT id FROM deck_branches WHERE deck_id = :deck AND name = :name")
				.param("deck", deckId)
				.param("name", name)
				.query(UUID.class)
				.optional();
	}

	public List<BranchRow> branches(UUID deckId) {
		return jdbc.sql("""
				SELECT b.id, b.name, b.is_main,
				       (SELECT fv.version_number FROM deck_versions fv WHERE fv.id = b.forked_from_version_id) AS forked_from
				  FROM deck_branches b
				 WHERE b.deck_id = :deck
				 ORDER BY b.created_at, b.name
				""")
				.param("deck", deckId)
				.query((rs, n) -> new BranchRow(
						rs.getObject("id", UUID.class),
						rs.getString("name"),
						(Integer) rs.getObject("forked_from"),
						rs.getBoolean("is_main")))
				.list();
	}

	public boolean hasVersions(UUID deckId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM deck_versions WHERE deck_id = :deck)")
				.param("deck", deckId)
				.query(Boolean.class)
				.single();
	}

	// ---- versions ----

	public int nextVersionNumber(UUID deckId) {
		// A counter that only goes up, so a deleted number is never handed out again.
		return jdbc.sql("UPDATE decks SET next_version_number = next_version_number + 1 WHERE id = :deck RETURNING next_version_number - 1")
				.param("deck", deckId)
				.query(Integer.class)
				.single();
	}

	public UUID insertVersion(UUID deckId, int number, String note, UUID branchId, UUID parentVersionId, UUID mergeParentId) {
		return jdbc.sql("""
				INSERT INTO deck_versions (deck_id, version_number, note, branch_id, parent_version_id, merge_parent_version_id)
				VALUES (:deck, :number, :note, :branch, :parent, :mergeParent) RETURNING id
				""")
				.param("mergeParent", mergeParentId)
				.param("deck", deckId)
				.param("number", number)
				.param("note", note)
				.param("branch", branchId)
				.param("parent", parentVersionId)
				.query(UUID.class)
				.single();
	}

	public void insertVersionCards(UUID versionId, List<DeckCardInput> cards) {
		template.batchUpdate(
				"INSERT INTO deck_version_cards (version_id, card_id, board, quantity, printing_id, tags, custom_printing_id)"
						+ " VALUES (?, ?, ?, ?, ?, ?, ?)",
				new BatchPreparedStatementSetter() {
					@Override
					public void setValues(PreparedStatement ps, int i) throws SQLException {
						DeckCardInput card = cards.get(i);
						ps.setObject(1, versionId);
						ps.setObject(2, card.cardId());
						ps.setString(3, card.board());
						ps.setInt(4, card.quantity());
						ps.setObject(5, card.printingId());
						List<String> tags = card.tags() == null ? List.of() : card.tags();
						ps.setArray(6, ps.getConnection().createArrayOf("text", tags.toArray(new String[0])));
						ps.setObject(7, card.customPrintingId());
					}

					@Override
					public int getBatchSize() {
						return cards.size();
					}
				});
	}

	public Optional<VersionRow> findVersion(UUID deckId, int number) {
		return jdbc.sql(VERSION_SELECT + " WHERE v.deck_id = :deck AND v.version_number = :number")
				.param("deck", deckId)
				.param("number", number)
				.query(DeckRepository::mapVersion)
				.optional();
	}

	/** The most recently saved version of the deck, on whichever branch. */
	public Optional<VersionRow> findLatestVersion(UUID deckId) {
		return jdbc.sql(VERSION_SELECT + " WHERE v.deck_id = :deck ORDER BY v.version_number DESC LIMIT 1")
				.param("deck", deckId)
				.query(DeckRepository::mapVersion)
				.optional();
	}

	public List<VersionSummary> versionSummaries(UUID deckId) {
		return jdbc.sql("""
				SELECT v.version_number, v.note, v.created_at, v.branch_id,
				       (SELECT p.version_number FROM deck_versions p WHERE p.id = v.parent_version_id) AS parent_number,
				       (SELECT m.version_number FROM deck_versions m WHERE m.id = v.merge_parent_version_id) AS merge_number,
				       (SELECT COUNT(*) FROM deck_version_cards n
				         WHERE n.version_id = v.id AND v.parent_version_id IS NOT NULL
				           AND NOT EXISTS (SELECT 1 FROM deck_version_cards o WHERE o.version_id = v.parent_version_id
				                            AND o.card_id = n.card_id AND o.board = n.board)) AS added,
				       (SELECT COUNT(*) FROM deck_version_cards o
				         WHERE o.version_id = v.parent_version_id
				           AND NOT EXISTS (SELECT 1 FROM deck_version_cards n WHERE n.version_id = v.id
				                            AND n.card_id = o.card_id AND n.board = o.board)) AS removed,
				       COALESCE(SUM(dc.quantity) FILTER (WHERE dc.board IN ('commander', 'main')), 0) AS card_count,
				       COALESCE(SUM(c.mana_value * dc.quantity)
				                FILTER (WHERE dc.board IN ('commander', 'main') AND c.primary_type <> 'Land'), 0) AS mv_sum,
				       COALESCE(SUM(dc.quantity)
				                FILTER (WHERE dc.board IN ('commander', 'main') AND c.primary_type <> 'Land'), 0) AS non_land
				  FROM deck_versions v
				  LEFT JOIN deck_version_cards dc ON dc.version_id = v.id
				  LEFT JOIN cards c ON c.id = dc.card_id
				 WHERE v.deck_id = :deck
				 GROUP BY v.id
				 ORDER BY v.version_number DESC
				""")
				.param("deck", deckId)
				.query((rs, n) -> {
					long nonLand = rs.getLong("non_land");
					double average = nonLand == 0 ? 0 : StatsCalculator.round2(rs.getDouble("mv_sum") / nonLand);
					return new VersionSummary(
							rs.getInt("version_number"),
							rs.getString("note"),
							rs.getTimestamp("created_at").toInstant(),
							rs.getInt("card_count"),
							average,
							rs.getObject("branch_id", UUID.class),
							(Integer) rs.getObject("parent_number"),
							(Integer) rs.getObject("merge_number"),
							rs.getInt("added"),
							rs.getInt("removed"));
				})
				.list();
	}

	/**
	 * A version's cards, with how many copies the viewing user owns of each. A line that pins a
	 * printing shows that printing's art, set and price. Otherwise it shows the card's default.
	 */
	public List<DeckCardLine> versionLines(UUID versionId, UUID userId) {
		return jdbc.sql("""
				SELECT c.id AS card_id, c.name, c.mana_cost, c.mana_value, c.primary_type, c.type_line, c.colors, c.color_identity,
				       c.oracle_text,
				       COALESCE(p.rarity, c.rarity) AS rarity,
				       CASE WHEN cp.id IS NOT NULL THEN 'Custom art' ELSE COALESCE(p.artist, c.artist) END AS artist,
				       CASE WHEN cp.id IS NOT NULL THEN '/api/custom-printings/' || cp.id || '/image'
				            ELSE COALESCE(p.image_small, c.image_small) END AS image_small,
				       CASE WHEN cp.id IS NOT NULL THEN '/api/custom-printings/' || cp.id || '/image'
				            ELSE COALESCE(p.image_normal, c.image_normal) END AS image_normal,
				       CASE WHEN cp.id IS NOT NULL THEN '/api/custom-printings/' || cp.id || '/image'
				            ELSE COALESCE(p.image_art_crop, c.image_art_crop) END AS image_art_crop,
				       COALESCE(p.scryfall_id, c.scryfall_id) AS printing_id,
				       cp.id AS custom_printing_id,
				       CASE WHEN cp.id IS NOT NULL THEN 'custom' ELSE COALESCE(p.set_code, c.set_code) END AS set_code,
				       CASE WHEN cp.id IS NOT NULL THEN cp.label ELSE COALESCE(p.set_name, c.set_name) END AS set_name,
				       CASE WHEN cp.id IS NOT NULL THEN '' ELSE COALESCE(p.collector_number, c.collector_number) END AS collector_number,
				       CASE WHEN p.scryfall_id IS NOT NULL THEN p.price_usd ELSE c.price_usd END AS price_usd,
				       dc.board, dc.quantity, COALESCE(e.quantity, 0) AS owned, dc.tags
				  FROM deck_version_cards dc
				  JOIN cards c ON c.id = dc.card_id
				  LEFT JOIN card_printings p ON p.scryfall_id = dc.printing_id
				  LEFT JOIN custom_printings cp ON cp.id = dc.custom_printing_id
				  LEFT JOIN collection_entries e ON e.card_id = c.id AND e.user_id = :user
				 WHERE dc.version_id = :version
				 ORDER BY CASE dc.board WHEN 'commander' THEN 0 WHEN 'main' THEN 1 WHEN 'maybe' THEN 2 ELSE 3 END,
				          c.name
				""")
				.param("version", versionId)
				.param("user", userId)
				.query(DeckRepository::mapLine)
				.list();
	}

	/** Who owns each of these custom arts and which card it is for. Unknown ids are left out. */
	public Map<UUID, CustomOwner> customPrintingOwners(Collection<UUID> ids) {
		if (ids.isEmpty()) {
			return Map.of();
		}
		Map<UUID, CustomOwner> result = new HashMap<>();
		jdbc.sql("SELECT id, user_id, card_id FROM custom_printings WHERE id IN (:ids)")
				.param("ids", ids)
				.query((rs, n) -> {
					result.put(rs.getObject("id", UUID.class),
							new CustomOwner(rs.getObject("user_id", UUID.class), rs.getObject("card_id", UUID.class)));
					return null;
				})
				.list();
		return result;
	}

	/** Default printing id of each known card, keyed by card id. Also tells which card ids exist. */
	public Map<UUID, UUID> defaultPrintings(Collection<UUID> cardIds) {
		if (cardIds.isEmpty()) {
			return Map.of();
		}
		Map<UUID, UUID> result = new HashMap<>();
		jdbc.sql("SELECT id, scryfall_id FROM cards WHERE id IN (:ids)")
				.param("ids", cardIds)
				.query((rs, n) -> {
					result.put(rs.getObject("id", UUID.class), rs.getObject("scryfall_id", UUID.class));
					return null;
				})
				.list();
		return result;
	}

	/** Which card each of these printing ids belongs to. Unknown printings are left out. */
	public Map<UUID, UUID> printingOwners(Collection<UUID> printingIds) {
		if (printingIds.isEmpty()) {
			return Map.of();
		}
		Map<UUID, UUID> result = new HashMap<>();
		jdbc.sql("SELECT scryfall_id, card_id FROM card_printings WHERE scryfall_id IN (:ids)")
				.param("ids", printingIds)
				.query((rs, n) -> {
					result.put(rs.getObject("scryfall_id", UUID.class), rs.getObject("card_id", UUID.class));
					return null;
				})
				.list();
		return result;
	}

	private static VersionRow mapVersion(ResultSet rs, int rowNum) throws SQLException {
		return new VersionRow(
				rs.getObject("id", UUID.class),
				rs.getInt("version_number"),
				rs.getString("note"),
				rs.getTimestamp("created_at").toInstant(),
				rs.getObject("branch_id", UUID.class),
				rs.getString("branch_name"),
				(Integer) rs.getObject("parent_number"),
				rs.getBoolean("is_head"),
				rs.getObject("parent_version_id", UUID.class),
				rs.getBoolean("is_main"));
	}

	private static DeckCardLine mapLine(ResultSet rs, int rowNum) throws SQLException {
		java.sql.Array tagArray = rs.getArray("tags");
		List<String> tags = tagArray == null ? List.of() : List.of((String[]) tagArray.getArray());
		return new DeckCardLine(
				rs.getObject("card_id", UUID.class),
				rs.getString("name"),
				rs.getString("mana_cost"),
				rs.getDouble("mana_value"),
				rs.getString("primary_type"),
				rs.getString("type_line"),
				rs.getString("colors"),
				rs.getString("color_identity"),
				rs.getString("oracle_text"),
				rs.getString("rarity"),
				rs.getString("artist"),
				rs.getString("image_small"),
				rs.getString("image_normal"),
				rs.getString("image_art_crop"),
				rs.getObject("printing_id", UUID.class),
				rs.getObject("custom_printing_id", UUID.class),
				rs.getString("set_code"),
				rs.getString("set_name"),
				rs.getString("collector_number"),
				io.eregion.common.Sql.nullableDouble(rs, "price_usd"),
				rs.getString("board"),
				rs.getInt("quantity"),
				rs.getInt("owned"),
				tags);
	}
}
