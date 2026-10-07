package io.eregion.card;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class PrintingRepository {

	private static final String COLUMNS = """
			scryfall_id, card_id, set_code, set_name, collector_number, released_at, rarity, artist,
			image_small, image_normal, image_art_crop, price_usd
			""";

	private final JdbcClient jdbc;

	public PrintingRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public void upsert(Printing p) {
		jdbc.sql("""
				INSERT INTO card_printings (scryfall_id, card_id, set_code, set_name, collector_number, released_at,
				                            rarity, artist, image_small, image_normal, image_art_crop, price_usd,
				                            fetched_at)
				VALUES (:id, :card, :setCode, :setName, :number, :released, :rarity, :artist, :small, :normal,
				        :art, :price, now())
				ON CONFLICT (scryfall_id) DO UPDATE SET
				    set_name = EXCLUDED.set_name,
				    collector_number = EXCLUDED.collector_number,
				    released_at = EXCLUDED.released_at,
				    rarity = EXCLUDED.rarity,
				    artist = EXCLUDED.artist,
				    image_small = EXCLUDED.image_small,
				    image_normal = EXCLUDED.image_normal,
				    image_art_crop = EXCLUDED.image_art_crop,
				    price_usd = EXCLUDED.price_usd,
				    fetched_at = now()
				""")
				.param("id", p.scryfallId())
				.param("card", p.cardId())
				.param("setCode", p.setCode())
				.param("setName", p.setName())
				.param("number", p.collectorNumber())
				.param("released", p.releasedAt() == null ? null : LocalDate.parse(p.releasedAt()))
				.param("rarity", p.rarity())
				.param("artist", p.artist())
				.param("small", p.imageSmall())
				.param("normal", p.imageNormal())
				.param("art", p.imageArtCrop())
				.param("price", p.priceUsd())
				.update();
	}

	public List<Printing> forCard(UUID cardId) {
		return jdbc.sql("SELECT " + COLUMNS + " FROM card_printings WHERE card_id = :card"
				+ " ORDER BY released_at DESC NULLS LAST, set_code, collector_number")
				.param("card", cardId)
				.query(PrintingRepository::map)
				.list();
	}

	/** When this card's printings were last fetched from Scryfall, or empty if never. */
	public Optional<Instant> lastFetched(UUID cardId) {
		return jdbc.sql("SELECT MAX(fetched_at) FROM card_printings WHERE card_id = :card")
				.param("card", cardId)
				.query((rs, n) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant())
				.list()
				.stream()
				.filter(java.util.Objects::nonNull)
				.findFirst();
	}

	/** Printings that some deck has pinned and whose price is older than {@code hours} hours. */
	public List<UUID> pinnedStale(int hours, int limit) {
		return jdbc.sql("""
				SELECT p.scryfall_id FROM card_printings p
				 WHERE p.fetched_at < now() - make_interval(hours => :hours)
				   AND EXISTS (SELECT 1 FROM deck_version_cards dc WHERE dc.printing_id = p.scryfall_id)
				 ORDER BY p.fetched_at
				 LIMIT :limit
				""")
				.param("hours", hours)
				.param("limit", limit)
				.query(UUID.class)
				.list();
	}

	/** Which card each of these printings belongs to. */
	public java.util.Map<UUID, UUID> cardIds(Collection<UUID> printingIds) {
		java.util.Map<UUID, UUID> result = new java.util.HashMap<>();
		if (printingIds.isEmpty()) {
			return result;
		}
		jdbc.sql("SELECT scryfall_id, card_id FROM card_printings WHERE scryfall_id IN (:ids)")
				.param("ids", printingIds)
				.query((rs, n) -> {
					result.put(rs.getObject("scryfall_id", UUID.class), rs.getObject("card_id", UUID.class));
					return null;
				})
				.list();
		return result;
	}

	/** Which of these printing ids exist, so a deck cannot pin a printing we do not know. */
	public Set<UUID> existing(Collection<UUID> ids) {
		if (ids.isEmpty()) {
			return Set.of();
		}
		return new HashSet<>(jdbc.sql("SELECT scryfall_id FROM card_printings WHERE scryfall_id IN (:ids)")
				.param("ids", ids)
				.query(UUID.class)
				.list());
	}

	private static Printing map(ResultSet rs, int rowNum) throws SQLException {
		LocalDate released = rs.getObject("released_at", LocalDate.class);
		return new Printing(
				rs.getObject("scryfall_id", UUID.class),
				rs.getObject("card_id", UUID.class),
				rs.getString("set_code"),
				rs.getString("set_name"),
				rs.getString("collector_number"),
				released == null ? null : released.toString(),
				rs.getString("rarity"),
				rs.getString("artist"),
				rs.getString("image_small"),
				rs.getString("image_normal"),
				rs.getString("image_art_crop"),
				io.eregion.common.Sql.nullableDouble(rs, "price_usd"));
	}
}
