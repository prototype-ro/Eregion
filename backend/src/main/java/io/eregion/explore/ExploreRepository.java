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
			boolean mine) {
	}

	/** A public deck's published version id, for loading its cards. */
	public record Published(PublicDeck deck, UUID versionId) {
	}

	private static final String SELECT = """
			SELECT d.id, d.name, u.display_name AS owner_name, d.published_at, d.owner_id = :viewer AS mine,
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
			       COALESCE((SELECT SUM(COALESCE(c.price_usd, 0) * dc.quantity) FROM deck_version_cards dc
			                   JOIN cards c ON c.id = dc.card_id
			                  WHERE dc.version_id = v.id AND dc.board IN ('commander', 'main')), 0) AS price
			  FROM decks d
			  JOIN users u ON u.id = d.owner_id
			  JOIN deck_versions v ON v.id = d.published_version_id
			 WHERE d.visibility = 'public'
			""";

	private final JdbcClient jdbc;

	public ExploreRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * Public decks, newest first. commanderId limits the list to decks whose published version has that
	 * card as a commander. text matches the deck name, the commander or the author.
	 */
	public List<PublicDeck> search(UUID viewerId, UUID commanderId, String text, int limit, int offset) {
		return jdbc.sql(SELECT + """
				   AND (CAST(:commander AS uuid) IS NULL OR EXISTS (
				        SELECT 1 FROM deck_version_cards dc
				         WHERE dc.version_id = v.id AND dc.board = 'commander' AND dc.card_id = CAST(:commander AS uuid)))
				   AND (CAST(:text AS text) IS NULL OR d.name ILIKE :text ESCAPE '!' OR u.display_name ILIKE :text ESCAPE '!'
				        OR EXISTS (SELECT 1 FROM deck_version_cards dc JOIN cards c ON c.id = dc.card_id
				                    WHERE dc.version_id = v.id AND dc.board = 'commander' AND c.name ILIKE :text ESCAPE '!'))
				 ORDER BY d.published_at DESC
				 LIMIT :limit OFFSET :offset
				""")
				.param("viewer", viewerId)
				.param("commander", commanderId)
				.param("text", text == null ? null : "%" + escape(text) + "%")
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
				rs.getBoolean("mine"));
	}
}
