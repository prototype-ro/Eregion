package io.eregion.collection;

import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;

@Repository
public class CollectionRepository {

	public record CollectionEntry(Card card, int quantity) {
	}

	private final JdbcClient jdbc;
	private final org.springframework.jdbc.core.JdbcTemplate template;

	public CollectionRepository(JdbcClient jdbc, org.springframework.jdbc.core.JdbcTemplate template) {
		this.jdbc = jdbc;
		this.template = template;
	}

	public List<CollectionEntry> list(UUID userId) {
		return jdbc.sql("""
				SELECT c.id, c.scryfall_id, c.name, c.mana_cost, c.mana_value, c.type_line, c.primary_type,
				       c.colors, c.color_identity, c.oracle_text, c.set_code, c.set_name, c.collector_number,
				       c.rarity, c.artist, c.price_usd, c.image_small, c.image_normal, c.image_art_crop, c.commander_legality, e.quantity
				  FROM collection_entries e
				  JOIN cards c ON c.id = e.card_id
				 WHERE e.user_id = :user
				 ORDER BY c.name
				""")
				.param("user", userId)
				.query((rs, n) -> new CollectionEntry(CardRepository.map(rs, n), rs.getInt("quantity")))
				.list();
	}

	/** Adds to what is already owned, never going past the per-card cap. */
	public void addQuantities(UUID userId, java.util.Map<UUID, Integer> quantities) {
		if (quantities.isEmpty()) {
			return;
		}
		java.util.List<Object[]> rows = new java.util.ArrayList<>();
		quantities.forEach((cardId, quantity) -> rows.add(new Object[] { userId, cardId, quantity }));
		template.batchUpdate("""
				INSERT INTO collection_entries (user_id, card_id, quantity) VALUES (?, ?, ?)
				ON CONFLICT (user_id, card_id)
				DO UPDATE SET quantity = LEAST(%d, collection_entries.quantity + EXCLUDED.quantity)
				""".formatted(CollectionService.MAX_QUANTITY), rows);
	}

	public void clear(UUID userId) {
		jdbc.sql("DELETE FROM collection_entries WHERE user_id = :user").param("user", userId).update();
	}

	/** Setting a quantity of zero removes the card from the collection. */
	public void setQuantity(UUID userId, UUID cardId, int quantity) {
		if (quantity <= 0) {
			jdbc.sql("DELETE FROM collection_entries WHERE user_id = :user AND card_id = :card")
					.param("user", userId)
					.param("card", cardId)
					.update();
			return;
		}
		jdbc.sql("""
				INSERT INTO collection_entries (user_id, card_id, quantity)
				VALUES (:user, :card, :quantity)
				ON CONFLICT (user_id, card_id) DO UPDATE SET quantity = EXCLUDED.quantity
				""")
				.param("user", userId)
				.param("card", cardId)
				.param("quantity", quantity)
				.update();
	}
}
