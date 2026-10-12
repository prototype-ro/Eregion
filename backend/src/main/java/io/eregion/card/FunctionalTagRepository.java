package io.eregion.card;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class FunctionalTagRepository {

	private static final int CHUNK = 500;

	/** One role a card has, from one source, and how sure that source is. */
	public record Tag(UUID cardId, String category, String source, double confidence) {
	}

	/** A card the text rules can look at. */
	public record Candidate(UUID id, String name, String oracleText, String primaryType) {
	}

	private final JdbcClient jdbc;
	private final JdbcTemplate template;

	public FunctionalTagRepository(JdbcClient jdbc, JdbcTemplate template) {
		this.jdbc = jdbc;
		this.template = template;
	}

	public Optional<String> state(String key) {
		return jdbc.sql("SELECT value FROM functional_tag_state WHERE key = :key").param("key", key).query(String.class).optional();
	}

	public void setState(String key, String value) {
		jdbc.sql("INSERT INTO functional_tag_state (key, value) VALUES (:key, :value) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value")
				.param("key", key).param("value", value).update();
	}

	/** When this source last finished a sync, or empty if it never has. */
	public Optional<Instant> lastSynced(String source) {
		return jdbc.sql("SELECT max(synced_at) FROM card_functional_tags WHERE source = :source")
				.param("source", source)
				.query((rs, n) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant())
				.optional()
				.filter(java.util.Objects::nonNull);
	}

	/** The ids of the cards the database knows, by lower-case name, for the names given. */
	public Map<String, UUID> idsByName(Collection<String> lowerNames) {
		Map<String, UUID> ids = new HashMap<>();
		List<String> names = new ArrayList<>(lowerNames);
		for (int start = 0; start < names.size(); start += CHUNK) {
			jdbc.sql("SELECT id, lower(name) AS name FROM cards WHERE lower(name) IN (:names)")
					.param("names", names.subList(start, Math.min(start + CHUNK, names.size())))
					.query((rs, n) -> {
						ids.put(rs.getString("name"), rs.getObject("id", UUID.class));
						return null;
					})
					.list();
		}
		return ids;
	}

	/**
	 * Makes this source's tags exactly {@code tags}, then removes the ones it set in an earlier run that are not in the new set.
	 * Rows are written as non-primary: {@link #setPrimaries} decides the main role once every source has been written.
	 */
	public void replaceSource(String source, List<Tag> tags, Instant runStart) {
		java.sql.Timestamp stamp = java.sql.Timestamp.from(runStart);
		upsert(tags, stamp);
		jdbc.sql("DELETE FROM card_functional_tags WHERE source = :source AND synced_at < :start")
				.param("source", source)
				.param("start", stamp)
				.update();
	}

	/** Replaces the guesses for exactly these cards, and leaves every other card's guesses alone. */
	public void replaceGuesses(Collection<UUID> cardIds, List<Tag> tags, Instant runStart) {
		List<UUID> ids = new ArrayList<>(cardIds);
		for (int start = 0; start < ids.size(); start += CHUNK) {
			jdbc.sql("DELETE FROM card_functional_tags WHERE source = :source AND card_id IN (:ids)")
					.param("source", FunctionalRules.SOURCE)
					.param("ids", ids.subList(start, Math.min(start + CHUNK, ids.size())))
					.update();
		}
		upsert(tags, java.sql.Timestamp.from(runStart));
	}

	private void upsert(List<Tag> tags, java.sql.Timestamp stamp) {
		template.batchUpdate("""
				INSERT INTO card_functional_tags (card_id, category, source, confidence, is_primary, synced_at) VALUES (?, ?, ?, ?, false, ?)
				ON CONFLICT (card_id, category, source) DO UPDATE SET confidence = EXCLUDED.confidence, synced_at = EXCLUDED.synced_at
				""", new BatchPreparedStatementSetter() {
			@Override
			public void setValues(PreparedStatement ps, int i) throws SQLException {
				Tag tag = tags.get(i);
				ps.setObject(1, tag.cardId());
				ps.setString(2, tag.category());
				ps.setString(3, tag.source());
				ps.setDouble(4, tag.confidence());
				ps.setTimestamp(5, stamp);
			}

			@Override
			public int getBatchSize() {
				return tags.size();
			}
		});
	}

	/**
	 * Cards the text rules may look at. With {@code onlyUntagged} only those with no tag at all, which is the cheap check for cards just
	 * imported. Otherwise every card that is not a land, so a tagged card can pick up extra roles. A land is never given a role.
	 */
	public List<Candidate> candidates(boolean onlyUntagged) {
		String untagged = onlyUntagged ? " AND NOT EXISTS (SELECT 1 FROM card_functional_tags t WHERE t.card_id = c.id)" : "";
		return jdbc.sql("SELECT c.id, c.name, c.oracle_text, c.primary_type FROM cards c WHERE c.primary_type <> 'Land'" + untagged)
				.query((rs, n) -> new Candidate(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("oracle_text"), rs.getString("primary_type")))
				.list();
	}

	public List<Tag> allTags() {
		return jdbc.sql("SELECT card_id, category, source, confidence FROM card_functional_tags")
				.query((rs, n) -> new Tag(rs.getObject("card_id", UUID.class), rs.getString("category"), rs.getString("source"), rs.getDouble("confidence")))
				.list();
	}

	/** Marks exactly one row per card as its main role. {@code primaries} holds the chosen row of each card. */
	public void setPrimaries(Collection<Tag> primaries) {
		jdbc.sql("UPDATE card_functional_tags SET is_primary = false WHERE is_primary").update();
		List<Tag> rows = new ArrayList<>(primaries);
		template.batchUpdate("UPDATE card_functional_tags SET is_primary = true WHERE card_id = ? AND category = ? AND source = ?",
				new BatchPreparedStatementSetter() {
					@Override
					public void setValues(PreparedStatement ps, int i) throws SQLException {
						ps.setObject(1, rows.get(i).cardId());
						ps.setString(2, rows.get(i).category());
						ps.setString(3, rows.get(i).source());
					}

					@Override
					public int getBatchSize() {
						return rows.size();
					}
				});
	}
}
