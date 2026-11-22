package io.eregion.deck;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import io.eregion.deck.BackdropRepository.Backdrop;

/**
 * Card art for backdrops, from the cards in the catalog: their art crops are always the right way up and wider than tall,
 * which Art Series images are not. No call to Scryfall is needed.
 */
@Service
public class CardArt {

	private static final int MAX_RESULTS = 24;
	private static final String COLUMNS = "scryfall_id, name, artist, set_name, image_art_crop";

	private final JdbcClient jdbc;

	public CardArt(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** count cards at random, each with its art. */
	public List<Backdrop> random(int count) {
		return jdbc.sql("SELECT " + COLUMNS + " FROM cards WHERE image_art_crop LIKE 'https://%' ORDER BY random() LIMIT :n")
				.param("n", Math.max(count, 0))
				.query((rs, n) -> row(rs))
				.list();
	}

	/** Cards whose name contains the text, names that start with it first. Text under two letters finds nothing. */
	public List<Backdrop> search(String text) {
		String clean = text == null ? "" : text.replaceAll("\\s+", " ").trim();
		if (clean.length() < 2) {
			return List.of();
		}
		String pattern = "%" + clean.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
		return jdbc.sql("""
				SELECT %s FROM cards
				 WHERE image_art_crop LIKE 'https://%%' AND name ILIKE :p
				 ORDER BY (lower(name) LIKE lower(:start)) DESC, name
				 LIMIT :n
				""".formatted(COLUMNS))
				.param("p", pattern)
				.param("start", clean.replace("%", "") + "%")
				.param("n", MAX_RESULTS)
				.query((rs, n) -> row(rs))
				.list();
	}

	/** Looks a chosen card up again, so a backdrop is always a catalog card's art, never an address sent by a browser. */
	public Optional<Backdrop> byId(UUID scryfallId) {
		return jdbc.sql("SELECT " + COLUMNS + " FROM cards WHERE scryfall_id = :id AND image_art_crop LIKE 'https://%'")
				.param("id", scryfallId)
				.query((rs, n) -> row(rs))
				.optional();
	}

	private static Backdrop row(java.sql.ResultSet rs) throws java.sql.SQLException {
		return new Backdrop(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5));
	}
}
