package io.eregion.render;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** One row per deck/card pair: the composited frame image the render pipeline most recently produced for it. */
@Repository
public class CardRenderRepository {

	public record CardRenderRow(UUID deckId, UUID cardId, byte[] imageData, String inputsHash) {
	}

	private final JdbcClient jdbc;

	public CardRenderRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** The render, when the viewer owns the deck or the deck is public. Anything else looks like a missing render. */
	public Optional<CardRenderRow> findVisibleTo(UUID deckId, UUID cardId, UUID viewerId) {
		return jdbc.sql("""
				SELECT cr.deck_id, cr.card_id, cr.image_data, cr.inputs_hash FROM card_renders cr
				JOIN decks d ON d.id = cr.deck_id
				WHERE cr.deck_id = :deckId AND cr.card_id = :cardId
				  AND (d.owner_id = :viewer OR d.visibility = 'public')
				""")
				.param("deckId", deckId).param("cardId", cardId).param("viewer", viewerId)
				.query((rs, n) -> new CardRenderRow(
						rs.getObject("deck_id", UUID.class), rs.getObject("card_id", UUID.class),
						rs.getBytes("image_data"), rs.getString("inputs_hash")))
				.optional();
	}

	public void upsert(UUID deckId, UUID cardId, byte[] imageData, String inputsHash) {
		jdbc.sql("""
				INSERT INTO card_renders (deck_id, card_id, image_data, inputs_hash, rendered_at)
				VALUES (:deckId, :cardId, :imageData, :inputsHash, now())
				ON CONFLICT (deck_id, card_id) DO UPDATE SET
				    image_data = EXCLUDED.image_data,
				    inputs_hash = EXCLUDED.inputs_hash,
				    rendered_at = now()
				""")
				.param("deckId", deckId).param("cardId", cardId)
				.param("imageData", imageData).param("inputsHash", inputsHash)
				.update();
	}
}
