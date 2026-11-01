package io.eregion.render;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** One row per deck: the artist, collection/set code and frame family used when compositing its proxies. */
@Repository
public class DeckFrameSettingsRepository {

	public record FrameSettingsRow(UUID deckId, String artistName, String collectionCode, String frameFamily) {
	}

	private final JdbcClient jdbc;

	public DeckFrameSettingsRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public Optional<FrameSettingsRow> findByDeckId(UUID deckId) {
		return jdbc.sql("SELECT deck_id, artist_name, collection_code, frame_family FROM deck_frame_settings WHERE deck_id = :deckId")
				.param("deckId", deckId)
				.query((rs, n) -> new FrameSettingsRow(
						rs.getObject("deck_id", UUID.class), rs.getString("artist_name"),
						rs.getString("collection_code"), rs.getString("frame_family")))
				.optional();
	}

	public FrameSettingsRow upsert(UUID deckId, String artistName, String collectionCode, String frameFamily) {
		return jdbc.sql("""
				INSERT INTO deck_frame_settings (deck_id, artist_name, collection_code, frame_family)
				VALUES (:deckId, :artistName, :collectionCode, :frameFamily)
				ON CONFLICT (deck_id) DO UPDATE SET
				    artist_name = EXCLUDED.artist_name,
				    collection_code = EXCLUDED.collection_code,
				    frame_family = EXCLUDED.frame_family
				RETURNING deck_id, artist_name, collection_code, frame_family
				""")
				.param("deckId", deckId).param("artistName", artistName)
				.param("collectionCode", collectionCode).param("frameFamily", frameFamily)
				.query((rs, n) -> new FrameSettingsRow(
						rs.getObject("deck_id", UUID.class), rs.getString("artist_name"),
						rs.getString("collection_code"), rs.getString("frame_family")))
				.single();
	}
}
