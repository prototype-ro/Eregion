package io.eregion.deck;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** The art a deck's owner chose for behind its header. Nothing stored means the commander's art. */
@Repository
public class BackdropRepository {

	/** A card's art: the printing's Scryfall id, the card's name, the artist, the set and the art's address. */
	public record Backdrop(UUID scryfallId, String name, String artist, String setName, String artUrl) {
	}

	private final JdbcClient jdbc;

	public BackdropRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public Optional<Backdrop> find(UUID deckId) {
		return jdbc.sql("SELECT scryfall_id, name, artist, set_name, art_url FROM deck_backdrops WHERE deck_id = :d")
				.param("d", deckId)
				.query((rs, n) -> new Backdrop(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5)))
				.optional();
	}

	public void save(UUID deckId, Backdrop art) {
		jdbc.sql("""
				INSERT INTO deck_backdrops (deck_id, scryfall_id, name, artist, set_name, art_url) VALUES (:d, :s, :n, :a, :set, :u)
				ON CONFLICT (deck_id) DO UPDATE SET scryfall_id = :s, name = :n, artist = :a, set_name = :set, art_url = :u, chosen_at = now()
				""").param("d", deckId).param("s", art.scryfallId()).param("n", art.name()).param("a", art.artist())
				.param("set", art.setName()).param("u", art.artUrl()).update();
	}

	public void clear(UUID deckId) {
		jdbc.sql("DELETE FROM deck_backdrops WHERE deck_id = :d").param("d", deckId).update();
	}
}
