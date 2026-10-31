package io.eregion.proxy;

import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import io.eregion.proxy.LoreDtos.LoreDoc;
import tools.jackson.databind.json.JsonMapper;

/** The structured lore document of a deck, stored as JSON next to the text digest the proxy prompt reads. */
@Repository
public class LoreRepository {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final JdbcClient jdbc;

	public LoreRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public boolean ownsDeck(UUID deckId, UUID userId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM decks WHERE id = :deck AND owner_id = :user)")
				.param("deck", deckId).param("user", userId).query(Boolean.class).single();
	}

	/** The saved document, or {@link LoreDoc#empty()} when the deck has none (or a damaged one). */
	public LoreDoc loreDoc(UUID deckId) {
		String json = jdbc.sql("SELECT lore_doc::text AS doc FROM decks WHERE id = :deck")
				.param("deck", deckId).query((rs, n) -> rs.getString("doc")).single();
		return readDoc(json);
	}

	/** Writes the document and the rendered digest together, so the proxy prompt always matches the editor. */
	public void saveLoreDoc(UUID deckId, String json, String digest) {
		jdbc.sql("UPDATE decks SET lore_doc = :doc::jsonb, lore = :lore WHERE id = :deck")
				.param("doc", json).param("lore", digest).param("deck", deckId).update();
	}

	private static LoreDoc readDoc(String json) {
		if (json == null || json.isBlank()) {
			return LoreDoc.empty();
		}
		try {
			LoreDoc doc = JSON.readValue(json, LoreDoc.class);
			return doc == null ? LoreDoc.empty() : doc;
		}
		catch (RuntimeException ex) {
			// A column that cannot be read is treated as "no lore" rather than failing the page.
			return LoreDoc.empty();
		}
	}
}
