package io.eregion.card;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class CardRepository {

	private static final String COLUMNS = """
			id, scryfall_id, name, mana_cost, mana_value, type_line, primary_type, colors, color_identity,
			oracle_text, set_code, set_name, collector_number, rarity, artist, price_usd,
			image_small, image_normal, image_art_crop
			""";

	private final JdbcClient jdbc;

	public CardRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public Optional<Card> findById(UUID id) {
		return jdbc.sql("SELECT " + COLUMNS + " FROM cards WHERE id = :id")
				.param("id", id)
				.query(CardRepository::map)
				.optional();
	}

	/** Prefix matches rank first, then any substring match, alphabetical within each group. */
	public List<Card> search(String query, int limit) {
		String escaped = query.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
		return jdbc.sql("SELECT " + COLUMNS + """
				 FROM cards
				WHERE name ILIKE :contains
				ORDER BY (name ILIKE :prefix) DESC, name
				LIMIT :limit
				""")
				.param("contains", "%" + escaped + "%")
				.param("prefix", escaped + "%")
				.param("limit", limit)
				.query(CardRepository::map)
				.list();
	}

	public List<Card> findByNames(java.util.Collection<String> names) {
		if (names.isEmpty()) {
			return List.of();
		}
		return jdbc.sql("SELECT " + COLUMNS + " FROM cards WHERE lower(name) IN (:names) OR lower(split_part(name, ' // ', 1)) IN (:names)")
				.param("names", names.stream().map(n -> n.toLowerCase(java.util.Locale.ROOT)).toList())
				.query(CardRepository::map)
				.list();
	}

	/** Scryfall ids of cards whose price has not been read in the last {@code hours} hours, never-read first. */
	public List<java.util.UUID> staleForPrices(int hours, int limit) {
		return jdbc.sql("""
				SELECT scryfall_id FROM cards
				 WHERE price_updated_at IS NULL OR price_updated_at < now() - make_interval(hours => :hours)
				 ORDER BY price_updated_at NULLS FIRST
				 LIMIT :limit
				""")
				.param("hours", hours)
				.param("limit", limit)
				.query(java.util.UUID.class)
				.list();
	}

	public boolean existsByName(String name) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM cards WHERE lower(name) = lower(:name))")
				.param("name", name)
				.query(Boolean.class)
				.single();
	}

	/** One row per card name. Re-importing refreshes the printing and images. */
	public Card upsert(Card card) {
		return jdbc.sql("""
				INSERT INTO cards (scryfall_id, name, mana_cost, mana_value, type_line, primary_type, colors,
				                   color_identity, oracle_text, set_code, set_name, collector_number, rarity,
				                   artist, price_usd, price_updated_at, image_small, image_normal, image_art_crop)
				VALUES (:scryfallId, :name, :manaCost, :manaValue, :typeLine, :primaryType, :colors,
				        :colorIdentity, :oracleText, :setCode, :setName, :collectorNumber, :rarity,
				        :artist, :priceUsd, now(), :imageSmall, :imageNormal, :imageArtCrop)
				ON CONFLICT (lower(name)) DO UPDATE SET
				    scryfall_id = EXCLUDED.scryfall_id,
				    mana_cost = EXCLUDED.mana_cost,
				    mana_value = EXCLUDED.mana_value,
				    type_line = EXCLUDED.type_line,
				    primary_type = EXCLUDED.primary_type,
				    colors = EXCLUDED.colors,
				    color_identity = EXCLUDED.color_identity,
				    oracle_text = EXCLUDED.oracle_text,
				    set_code = EXCLUDED.set_code,
				    set_name = EXCLUDED.set_name,
				    collector_number = EXCLUDED.collector_number,
				    rarity = EXCLUDED.rarity,
				    artist = EXCLUDED.artist,
				    price_usd = EXCLUDED.price_usd,
				    price_updated_at = now(),
				    image_small = EXCLUDED.image_small,
				    image_normal = EXCLUDED.image_normal,
				    image_art_crop = EXCLUDED.image_art_crop
				RETURNING """ + " " + COLUMNS)
				.param("scryfallId", card.scryfallId())
				.param("name", card.name())
				.param("manaCost", card.manaCost())
				.param("manaValue", card.manaValue())
				.param("typeLine", card.typeLine())
				.param("primaryType", card.primaryType())
				.param("colors", card.colors())
				.param("colorIdentity", card.colorIdentity())
				.param("oracleText", card.oracleText())
				.param("setCode", card.setCode())
				.param("setName", card.setName())
				.param("collectorNumber", card.collectorNumber())
				.param("rarity", card.rarity())
				.param("artist", card.artist())
				.param("priceUsd", card.priceUsd())
				.param("imageSmall", card.imageSmall())
				.param("imageNormal", card.imageNormal())
				.param("imageArtCrop", card.imageArtCrop())
				.query(CardRepository::map)
				.single();
	}

	public static Card map(ResultSet rs, int rowNum) throws SQLException {
		return new Card(
				rs.getObject("id", UUID.class),
				rs.getObject("scryfall_id", UUID.class),
				rs.getString("name"),
				rs.getString("mana_cost"),
				rs.getDouble("mana_value"),
				rs.getString("type_line"),
				rs.getString("primary_type"),
				rs.getString("colors"),
				rs.getString("color_identity"),
				rs.getString("oracle_text"),
				rs.getString("set_code"),
				rs.getString("set_name"),
				rs.getString("collector_number"),
				rs.getString("rarity"),
				rs.getString("artist"),
				io.eregion.common.Sql.nullableDouble(rs, "price_usd"),
				rs.getString("image_small"),
				rs.getString("image_normal"),
				rs.getString("image_art_crop"));
	}
}
