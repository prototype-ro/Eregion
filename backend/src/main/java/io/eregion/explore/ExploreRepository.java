package io.eregion.explore;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ExploreRepository {

	/** A public deck as shown in the list: the published version's headline facts, nothing private. */
	public record PublicDeck(
			UUID id,
			String name,
			String ownerName,
			String commanderName,
			String artUrl,
			String colorIdentity,
			int versionNumber,
			int cardCount,
			double priceUsd,
			Instant publishedAt,
			boolean mine,
			String description,
			/** The published version's bracket, once worked out. */
			Integer bracket,
			String bracketName,
			/** The bracket the owner says the deck is, or null. */
			Integer declaredBracket) {
	}

	/** A public deck's published version id, for loading its cards. */
	public record Published(PublicDeck deck, UUID versionId) {
	}

	private static final String SELECT = """
			SELECT d.id, d.name, d.description, u.display_name AS owner_name, d.published_at, d.owner_id = :viewer AS mine, d.declared_bracket,
			       v.id AS version_id, v.version_number,
			       (SELECT string_agg(c.name, ' + ' ORDER BY c.name) FROM deck_version_cards dc
			          JOIN cards c ON c.id = dc.card_id WHERE dc.version_id = v.id AND dc.board = 'commander') AS commander_name,
			       (SELECT c.image_art_crop FROM deck_version_cards dc JOIN cards c ON c.id = dc.card_id
			         WHERE dc.version_id = v.id AND dc.board = 'commander' ORDER BY c.name LIMIT 1) AS art_url,
			       COALESCE((SELECT string_agg(DISTINCT ch.ch, '') FROM deck_version_cards dc
			                   JOIN cards c ON c.id = dc.card_id
			                  CROSS JOIN LATERAL regexp_split_to_table(c.color_identity, '') AS ch(ch)
			                  WHERE dc.version_id = v.id AND dc.board = 'commander'), '') AS color_identity,
			       COALESCE((SELECT SUM(dc.quantity) FROM deck_version_cards dc
			                  WHERE dc.version_id = v.id AND dc.board IN ('commander', 'main')), 0) AS card_count,
			       COALESCE((SELECT SUM(COALESCE(dc.price_usd, c.price_usd, 0) * dc.quantity) FROM deck_version_cards dc
			                   JOIN cards c ON c.id = dc.card_id
			                  WHERE dc.version_id = v.id AND dc.board IN ('commander', 'main')), 0) AS price,
			       vb.bracket, vb.name AS bracket_name
			  FROM decks d
			  LEFT JOIN version_brackets vb ON vb.version_id = d.published_version_id
			  JOIN users u ON u.id = d.owner_id
			  JOIN deck_versions v ON v.id = d.published_version_id
			 WHERE d.visibility = 'public' AND d.deleted_at IS NULL
			""";

	/** One version on the way to a public deck's published version. */
	public record HistoryStep(UUID versionId, int versionNumber, String note, java.time.Instant createdAt, int cardCount) {
	}

	private final JdbcClient jdbc;

	public ExploreRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * Public decks, newest first. commanderId limits the list to decks whose published version has that
	 * card as a commander. text matches the deck name, the commander or the author.
	 */
	/** How Explore can be ordered. Anything else is newest first. */
	public enum Sort { NEWEST, PRICE_LOW, PRICE_HIGH }

	/**
	 * Public decks, newest first unless asked otherwise. commanderId limits the list to decks whose published version
	 * has that card as a commander; text matches the deck name, the commander or the author; colors keeps decks whose
	 * colour identity lies within those colours (letters of WUBRG); bracket and maxPrice filter on the published
	 * version's bracket (once worked out) and price.
	 */
	public List<PublicDeck> search(UUID viewerId, UUID commanderId, String text, String colors, Integer bracket, Double maxPrice, Sort sort,
			int limit, int offset) {
		String order = switch (sort) {
			case PRICE_LOW -> "q.price ASC, q.published_at DESC";
			case PRICE_HIGH -> "q.price DESC, q.published_at DESC";
			case NEWEST -> "q.published_at DESC";
		};
		return jdbc.sql("SELECT * FROM (" + SELECT + """
				   AND (CAST(:commander AS uuid) IS NULL OR EXISTS (
				        SELECT 1 FROM deck_version_cards dc
				         WHERE dc.version_id = v.id AND dc.board = 'commander' AND dc.card_id = CAST(:commander AS uuid)))
				   AND (CAST(:text AS text) IS NULL OR d.name ILIKE :text ESCAPE '!' OR u.display_name ILIKE :text ESCAPE '!'
				        OR EXISTS (SELECT 1 FROM deck_version_cards dc JOIN cards c ON c.id = dc.card_id
				                    WHERE dc.version_id = v.id AND dc.board = 'commander' AND c.name ILIKE :text ESCAPE '!'))
				) q
				 WHERE (CAST(:colors AS text) IS NULL OR q.color_identity ~ ('^[' || CAST(:colors AS text) || ']*$'))
				   AND (CAST(:bracket AS int) IS NULL OR q.bracket = CAST(:bracket AS int))
				   AND (CAST(:maxPrice AS double precision) IS NULL OR q.price <= CAST(:maxPrice AS double precision))
				 ORDER BY """ + " " + order + """

				 LIMIT :limit OFFSET :offset
				""")
				.param("viewer", viewerId)
				.param("commander", commanderId)
				.param("text", text == null ? null : "%" + escape(text) + "%")
				.param("colors", colors)
				.param("bracket", bracket)
				.param("maxPrice", maxPrice)
				.param("limit", limit)
				.param("offset", offset)
				.query((rs, n) -> map(rs))
				.list();
	}

	public Optional<Published> find(UUID viewerId, UUID deckId) {
		return jdbc.sql(SELECT + " AND d.id = :id")
				.param("viewer", viewerId)
				.param("id", deckId)
				.query((rs, n) -> new Published(map(rs), rs.getObject("version_id", UUID.class)))
				.optional();
	}

	/** Records a report. One per player per deck, so asking again changes nothing. False when the deck is not public or is the reporter's own. */
	public boolean report(UUID deckId, UUID reporterId, String reason) {
		boolean reportable = jdbc.sql("SELECT EXISTS (SELECT 1 FROM decks WHERE id = :deck AND visibility = 'public' AND deleted_at IS NULL AND owner_id <> :reporter)")
				.param("deck", deckId).param("reporter", reporterId).query(Boolean.class).single();
		if (reportable) {
			jdbc.sql("INSERT INTO deck_reports (deck_id, reporter_id, reason) VALUES (:deck, :reporter, :reason) ON CONFLICT (deck_id, reporter_id) DO NOTHING")
					.param("deck", deckId).param("reporter", reporterId).param("reason", reason).update();
		}
		return reportable;
	}

	/** Makes user text safe to use inside a LIKE pattern. */
	static String escape(String text) {
		return text.replace("!", "!!").replace("%", "!%").replace("_", "!_");
	}

	private static PublicDeck map(java.sql.ResultSet rs) throws java.sql.SQLException {
		return new PublicDeck(
				rs.getObject("id", UUID.class),
				rs.getString("name"),
				rs.getString("owner_name"),
				rs.getString("commander_name"),
				rs.getString("art_url"),
				rs.getString("color_identity"),
				rs.getInt("version_number"),
				rs.getInt("card_count"),
				rs.getDouble("price"),
				rs.getTimestamp("published_at").toInstant(),
				rs.getBoolean("mine"),
				rs.getString("description"),
				(Integer) rs.getObject("bracket"),
				rs.getString("bracket_name"),
				(Integer) rs.getObject("declared_bracket"));
	}

	/**
	 * The published version of a public deck and the versions it grew from, oldest first: the first parent of each
	 * version back to the deck's first, which is the line the owner actually followed. Never a version saved after the
	 * published one, and nothing at all when the owner hides the history. At most the latest 60.
	 */
	public List<HistoryStep> history(UUID deckId) {
		return jdbc.sql("""
				WITH RECURSIVE chain AS (
				    SELECT v.id, v.version_number, v.note, v.created_at, v.parent_version_id, 0 AS depth
				      FROM decks d JOIN deck_versions v ON v.id = d.published_version_id
				     WHERE d.id = :deck AND d.visibility = 'public' AND d.deleted_at IS NULL AND d.public_history
				    UNION ALL
				    SELECT p.id, p.version_number, p.note, p.created_at, p.parent_version_id, c.depth + 1
				      FROM deck_versions p JOIN chain c ON p.id = c.parent_version_id
				     WHERE c.depth < 59
				)
				SELECT id, version_number, note, created_at,
				       COALESCE((SELECT SUM(dc.quantity) FROM deck_version_cards dc
				                  WHERE dc.version_id = chain.id AND dc.board IN ('commander', 'main')), 0) AS card_count
				  FROM chain ORDER BY version_number
				""")
				.param("deck", deckId)
				.query((rs, n) -> new HistoryStep(rs.getObject("id", UUID.class), rs.getInt("version_number"), rs.getString("note"),
						rs.getTimestamp("created_at").toInstant(), rs.getInt("card_count")))
				.list();
	}
}
