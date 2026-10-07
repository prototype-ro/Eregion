package io.eregion.deck;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import io.eregion.deck.DeckDtos.DeckCardInput;
import io.eregion.deck.DeckDtos.DeckCardLine;
import io.eregion.deck.DeckDtos.DeckSummary;
import io.eregion.deck.DeckDtos.VersionSummary;

@Repository
public class DeckRepository {

	public record DeckRow(UUID id, UUID ownerId, String name, String format, Instant createdAt, Instant updatedAt) {
	}

	/** A version plus where it sits in the branch graph. head is true when nothing newer is on its branch. */
	public record VersionRow(UUID id, int number, String note, Instant createdAt, UUID branchId, String branchName,
			Integer parentVersion, boolean head) {
	}

	public record BranchRow(UUID id, String name, Integer forkedFromVersion) {
	}

	private static final String VERSION_SELECT = """
			SELECT v.id, v.version_number, v.note, v.created_at, v.branch_id, b.name AS branch_name,
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
				SELECT id, owner_id, name, format, created_at, updated_at
				  FROM decks WHERE id = :id AND owner_id = :owner
				""")
				.param("id", deckId)
				.param("owner", ownerId)
				.query((rs, n) -> new DeckRow(
						rs.getObject("id", UUID.class),
						rs.getObject("owner_id", UUID.class),
						rs.getString("name"),
						rs.getString("format"),
						rs.getTimestamp("created_at").toInstant(),
						rs.getTimestamp("updated_at").toInstant()))
				.optional();
	}

	public List<DeckSummary> summaries(UUID ownerId) {
		return jdbc.sql("""
				SELECT d.id, d.name, d.format, d.updated_at,
				       COALESCE(v.version_number, 0) AS latest_version,
				       COALESCE((SELECT SUM(dc.quantity) FROM deck_version_cards dc
				                  WHERE dc.version_id = v.id AND dc.board IN ('commander', 'main')), 0) AS card_count,
				       (SELECT c.name FROM deck_version_cards dc JOIN cards c ON c.id = dc.card_id
				         WHERE dc.version_id = v.id AND dc.board = 'commander' LIMIT 1) AS commander_name,
				       (SELECT c.image_art_crop FROM deck_version_cards dc JOIN cards c ON c.id = dc.card_id
				         WHERE dc.version_id = v.id AND dc.board = 'commander' LIMIT 1) AS art_url
				  FROM decks d
				  LEFT JOIN LATERAL (
				        SELECT id, version_number FROM deck_versions
				         WHERE deck_id = d.id ORDER BY version_number DESC LIMIT 1) v ON TRUE
				 WHERE d.owner_id = :owner
				 ORDER BY d.updated_at DESC
				""")
				.param("owner", ownerId)
				.query((rs, n) -> new DeckSummary(
						rs.getObject("id", UUID.class),
						rs.getString("name"),
						rs.getString("format"),
						rs.getInt("latest_version"),
						rs.getInt("card_count"),
						rs.getString("commander_name"),
						rs.getString("art_url"),
						rs.getTimestamp("updated_at").toInstant()))
				.list();
	}

	public void touch(UUID deckId) {
		jdbc.sql("UPDATE decks SET updated_at = now() WHERE id = :id").param("id", deckId).update();
	}

	public void delete(UUID deckId) {
		// Versions point at each other and at branches, so clear those links before the cascade.
		jdbc.sql("UPDATE deck_versions SET parent_version_id = NULL WHERE deck_id = :id").param("id", deckId).update();
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

	public Optional<UUID> findBranchId(UUID deckId, String name) {
		return jdbc.sql("SELECT id FROM deck_branches WHERE deck_id = :deck AND name = :name")
				.param("deck", deckId)
				.param("name", name)
				.query(UUID.class)
				.optional();
	}

	public List<BranchRow> branches(UUID deckId) {
		return jdbc.sql("""
				SELECT b.id, b.name,
				       (SELECT fv.version_number FROM deck_versions fv WHERE fv.id = b.forked_from_version_id) AS forked_from
				  FROM deck_branches b
				 WHERE b.deck_id = :deck
				 ORDER BY b.created_at, b.name
				""")
				.param("deck", deckId)
				.query((rs, n) -> new BranchRow(
						rs.getObject("id", UUID.class),
						rs.getString("name"),
						(Integer) rs.getObject("forked_from")))
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
		return jdbc.sql("SELECT COALESCE(MAX(version_number), 0) + 1 FROM deck_versions WHERE deck_id = :deck")
				.param("deck", deckId)
				.query(Integer.class)
				.single();
	}

	public UUID insertVersion(UUID deckId, int number, String note, UUID branchId, UUID parentVersionId) {
		return jdbc.sql("""
				INSERT INTO deck_versions (deck_id, version_number, note, branch_id, parent_version_id)
				VALUES (:deck, :number, :note, :branch, :parent) RETURNING id
				""")
				.param("deck", deckId)
				.param("number", number)
				.param("note", note)
				.param("branch", branchId)
				.param("parent", parentVersionId)
				.query(UUID.class)
				.single();
	}

	public void insertVersionCards(UUID versionId, List<DeckCardInput> cards) {
		List<Object[]> rows = new ArrayList<>(cards.size());
		for (DeckCardInput card : cards) {
			rows.add(new Object[] { versionId, card.cardId(), card.board(), card.quantity() });
		}
		template.batchUpdate(
				"INSERT INTO deck_version_cards (version_id, card_id, board, quantity) VALUES (?, ?, ?, ?)", rows);
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
							(Integer) rs.getObject("parent_number"));
				})
				.list();
	}

	/** A version's cards, with how many copies the viewing user owns of each. */
	public List<DeckCardLine> versionLines(UUID versionId, UUID userId) {
		return jdbc.sql("""
				SELECT c.id AS card_id, c.name, c.mana_cost, c.mana_value, c.primary_type, c.type_line, c.colors,
				       c.image_small, c.image_normal, c.image_art_crop,
				       dc.board, dc.quantity, COALESCE(e.quantity, 0) AS owned
				  FROM deck_version_cards dc
				  JOIN cards c ON c.id = dc.card_id
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

	public Set<UUID> existingCardIds(Collection<UUID> ids) {
		if (ids.isEmpty()) {
			return Set.of();
		}
		return new HashSet<>(jdbc.sql("SELECT id FROM cards WHERE id IN (:ids)")
				.param("ids", ids)
				.query(UUID.class)
				.list());
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
				rs.getBoolean("is_head"));
	}

	private static DeckCardLine mapLine(ResultSet rs, int rowNum) throws SQLException {
		return new DeckCardLine(
				rs.getObject("card_id", UUID.class),
				rs.getString("name"),
				rs.getString("mana_cost"),
				rs.getDouble("mana_value"),
				rs.getString("primary_type"),
				rs.getString("type_line"),
				rs.getString("colors"),
				rs.getString("image_small"),
				rs.getString("image_normal"),
				rs.getString("image_art_crop"),
				rs.getString("board"),
				rs.getInt("quantity"),
				rs.getInt("owned"));
	}
}
