package io.eregion.render;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** One row per card: the composited frame image the render pipeline most recently produced for it. */
@Repository
public class CardRenderRepository {

	public record CardRenderRow(UUID cardId, byte[] imageData, String inputsHash) {
	}

	private final JdbcClient jdbc;

	public CardRenderRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public Optional<CardRenderRow> findByCardId(UUID cardId) {
		return jdbc.sql("SELECT card_id, image_data, inputs_hash FROM card_renders WHERE card_id = :cardId")
				.param("cardId", cardId)
				.query((rs, n) -> new CardRenderRow(
						rs.getObject("card_id", UUID.class), rs.getBytes("image_data"), rs.getString("inputs_hash")))
				.optional();
	}

	public void upsert(UUID cardId, byte[] imageData, String inputsHash) {
		jdbc.sql("""
				INSERT INTO card_renders (card_id, image_data, inputs_hash, rendered_at)
				VALUES (:cardId, :imageData, :inputsHash, now())
				ON CONFLICT (card_id) DO UPDATE SET
				    image_data = EXCLUDED.image_data,
				    inputs_hash = EXCLUDED.inputs_hash,
				    rendered_at = now()
				""")
				.param("cardId", cardId).param("imageData", imageData).param("inputsHash", inputsHash)
				.update();
	}
}
