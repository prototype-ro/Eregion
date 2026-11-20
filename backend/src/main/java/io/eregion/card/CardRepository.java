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
			oracle_text, power, toughness, set_code, set_name, collector_number, rarity, artist, price_usd,
			image_small, image_normal, image_art_crop, commander_legality,
			""" + FunctionalTagSql.columns("cards.id") + "\n";

	/** The card's name without apostrophes, straight or curly, for matching what people type. */
	private static final String LOOSE_NAME = "replace(replace(name, '''', ''), '\u2019', '')";

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
	/**
	 * Name search in our catalogue. Tokens live in the same table but are only found when asked for, so a search for a card never offers
	 * a token of that name, and a search for a token never offers a card.
	 */
	public List<Card> search(String query, int limit, boolean commandersOnly, boolean tokens) {
		String trimmed = query.trim();
		// One ILIKE per word, all required, rather than one substring match on the whole phrase: a split or
		// adventure card's real name ("Fire // Ice", "Bonecrusher Giant // Stomp") has punctuation between the
		// words that a typed query never includes, so a single whole-phrase match would never find it.
		// Apostrophes are ignored on both sides: people type "kodamas reach" for Kodama's Reach.
		String unquoted = stripApostrophes(trimmed);
		String[] words = unquoted.split("\\s+");
		var where = new StringBuilder();
		for (int i = 0; i < words.length; i++) {
			where.append(i == 0 ? "" : " AND ").append(LOOSE_NAME).append(" ILIKE :w").append(i);
		}
		var spec = jdbc.sql("SELECT " + COLUMNS + """
				 FROM cards
				WHERE """ + " " + where + """

				  AND ((type_line LIKE 'Token%') = :tokens)
				  AND type_line <> 'Card // Card'
				  AND (:commandersOnly = false OR (type_line ILIKE '%legendary%'
				       AND (type_line ILIKE '%creature%' OR oracle_text ILIKE '%can be your commander%')))
				ORDER BY (""" + LOOSE_NAME + """
				 ILIKE :prefix) DESC, name
				LIMIT :limit
				""");
		for (int i = 0; i < words.length; i++) {
			spec = spec.param("w" + i, "%" + escape(words[i]) + "%");
		}
		return spec.param("prefix", escape(unquoted) + "%")
				.param("limit", limit)
				.param("commandersOnly", commandersOnly)
				.param("tokens", tokens)
				.query(CardRepository::map)
				.list();
	}

	private static String stripApostrophes(String s) {
		return s.replace("'", "").replace("\u2019", "");
	}

	private static String escape(String s) {
		return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
	}

	/** Whether a real card (not a token) already has this name. A token with the same name must not take its row over. */
	public boolean realCardExists(String name) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM cards WHERE lower(name) = lower(:name) AND type_line NOT LIKE 'Token%')")
				.param("name", name)
				.query(Boolean.class)
				.single();
	}

	/** The cards with these ids, in no particular order. Ids that are not in the catalog are simply absent. */
	public List<Card> findByIds(java.util.Collection<UUID> ids) {
		if (ids.isEmpty()) {
			return List.of();
		}
		return jdbc.sql("SELECT " + COLUMNS + " FROM cards WHERE id IN (:ids)")
				.param("ids", ids)
				.query(CardRepository::map)
				.list();
	}

	/** Which of these card ids are in the catalog. */
	public java.util.Set<UUID> existingIds(java.util.Collection<UUID> ids) {
		if (ids.isEmpty()) {
			return java.util.Set.of();
		}
		return new java.util.HashSet<>(jdbc.sql("SELECT id FROM cards WHERE id IN (:ids)")
				.param("ids", ids)
				.query(UUID.class)
				.list());
	}

	/**
	 * Cards whose full name, or front face, matches any of these names once case, accents and quotes are ignored.
	 * Art Series cards ("Mana Drain // Mana Drain") are never matched: their front face is a real card's name.
	 */
	public List<Card> findByNames(java.util.Collection<String> names) {
		if (names.isEmpty()) {
			return List.of();
		}
		return jdbc.sql("SELECT " + COLUMNS + " FROM cards WHERE type_line <> 'Card // Card'"
				+ " AND (eregion_norm(name) IN (:names) OR eregion_norm(split_part(name, ' // ', 1)) IN (:names))")
				.param("names", names.stream().map(NameNormalizer::normalize).distinct().toList())
				.query(CardRepository::map)
				.list();
	}

	/**
	 * Like {@link #findByNames} but with apostrophes ignored, for names typed without one ("Kodamas Reach"). The names
	 * must already be normalized and stripped with {@link NameNormalizer#loose}.
	 */
	public List<Card> findByLooseNames(java.util.Collection<String> looseNames) {
		if (looseNames.isEmpty()) {
			return List.of();
		}
		return jdbc.sql("SELECT " + COLUMNS + " FROM cards WHERE type_line <> 'Card // Card'"
				+ " AND (replace(eregion_norm(name), '''', '') IN (:names)"
				+ " OR replace(eregion_norm(split_part(name, ' // ', 1)), '''', '') IN (:names))")
				.param("names", List.copyOf(looseNames))
				.query(CardRepository::map)
				.list();
	}

	/** Scryfall ids of cards whose price has not been read in the last {@code hours} hours, never-read first. */
	public List<java.util.UUID> staleForPrices(int hours, int limit) {
		return jdbc.sql("""
				SELECT scryfall_id FROM cards
				 WHERE price_updated_at IS NULL OR commander_legality = 'unknown' OR price_updated_at < now() - make_interval(hours => :hours)
				 ORDER BY (commander_legality = 'unknown') DESC, price_updated_at NULLS FIRST
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
				                   color_identity, oracle_text, power, toughness, set_code, set_name, collector_number, rarity,
				                   artist, price_usd, price_updated_at, image_small, image_normal, image_art_crop, commander_legality)
				VALUES (:scryfallId, :name, :manaCost, :manaValue, :typeLine, :primaryType, :colors,
				        :colorIdentity, :oracleText, :power, :toughness, :setCode, :setName, :collectorNumber, :rarity,
				        :artist, :priceUsd, now(), :imageSmall, :imageNormal, :imageArtCrop, :commanderLegality)
				ON CONFLICT (lower(name)) DO UPDATE SET
				    scryfall_id = EXCLUDED.scryfall_id,
				    mana_cost = EXCLUDED.mana_cost,
				    mana_value = EXCLUDED.mana_value,
				    type_line = EXCLUDED.type_line,
				    primary_type = EXCLUDED.primary_type,
				    colors = EXCLUDED.colors,
				    color_identity = EXCLUDED.color_identity,
				    oracle_text = EXCLUDED.oracle_text,
				    power = EXCLUDED.power,
				    toughness = EXCLUDED.toughness,
				    set_code = EXCLUDED.set_code,
				    set_name = EXCLUDED.set_name,
				    collector_number = EXCLUDED.collector_number,
				    rarity = EXCLUDED.rarity,
				    artist = EXCLUDED.artist,
				    price_usd = EXCLUDED.price_usd,
				    price_updated_at = now(),
				    image_small = EXCLUDED.image_small,
				    image_normal = EXCLUDED.image_normal,
				    image_art_crop = EXCLUDED.image_art_crop,
				    commander_legality = EXCLUDED.commander_legality
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
				.param("power", card.power())
				.param("toughness", card.toughness())
				.param("setCode", card.setCode())
				.param("setName", card.setName())
				.param("collectorNumber", card.collectorNumber())
				.param("rarity", card.rarity())
				.param("artist", card.artist())
				.param("priceUsd", card.priceUsd())
				.param("imageSmall", card.imageSmall())
				.param("imageNormal", card.imageNormal())
				.param("imageArtCrop", card.imageArtCrop())
				.param("commanderLegality", card.commanderLegality())
				.query(CardRepository::map)
				.single();
	}

	/**
	 * Adds a card only if its name is not already in the catalog; an existing real card is left completely
	 * untouched. Used by the bulk catalog load, which must never change a card a deck may already be pinning a
	 * specific printing or piece of art for, unlike {@link #upsert}, which is for refreshing a card we are
	 * deliberately re-fetching by its own identity (a search hit, a price refresh).
	 * <p>
	 * One exception: names are unique, so a token stored first ("Llanowar Elves" from a token set) would keep the
	 * real card of that name out of the catalog for good. A real card therefore takes over a token's row.
	 */
	public int insertIfMissing(Card card) {
		return jdbc.sql("""
				INSERT INTO cards (scryfall_id, name, mana_cost, mana_value, type_line, primary_type, colors,
				                   color_identity, oracle_text, power, toughness, set_code, set_name, collector_number, rarity,
				                   artist, price_usd, price_updated_at, image_small, image_normal, image_art_crop, commander_legality)
				VALUES (:scryfallId, :name, :manaCost, :manaValue, :typeLine, :primaryType, :colors,
				        :colorIdentity, :oracleText, :power, :toughness, :setCode, :setName, :collectorNumber, :rarity,
				        :artist, :priceUsd, now(), :imageSmall, :imageNormal, :imageArtCrop, :commanderLegality)
				ON CONFLICT (lower(name)) DO UPDATE SET
				    scryfall_id = EXCLUDED.scryfall_id,
				    name = EXCLUDED.name,
				    mana_cost = EXCLUDED.mana_cost,
				    mana_value = EXCLUDED.mana_value,
				    type_line = EXCLUDED.type_line,
				    primary_type = EXCLUDED.primary_type,
				    colors = EXCLUDED.colors,
				    color_identity = EXCLUDED.color_identity,
				    oracle_text = EXCLUDED.oracle_text,
				    power = EXCLUDED.power,
				    toughness = EXCLUDED.toughness,
				    set_code = EXCLUDED.set_code,
				    set_name = EXCLUDED.set_name,
				    collector_number = EXCLUDED.collector_number,
				    rarity = EXCLUDED.rarity,
				    artist = EXCLUDED.artist,
				    price_usd = EXCLUDED.price_usd,
				    price_updated_at = now(),
				    image_small = EXCLUDED.image_small,
				    image_normal = EXCLUDED.image_normal,
				    image_art_crop = EXCLUDED.image_art_crop,
				    commander_legality = EXCLUDED.commander_legality
				 WHERE cards.type_line LIKE 'Token%' AND EXCLUDED.type_line NOT LIKE 'Token%'
				""")
				.param("scryfallId", card.scryfallId())
				.param("name", card.name())
				.param("manaCost", card.manaCost())
				.param("manaValue", card.manaValue())
				.param("typeLine", card.typeLine())
				.param("primaryType", card.primaryType())
				.param("colors", card.colors())
				.param("colorIdentity", card.colorIdentity())
				.param("oracleText", card.oracleText())
				.param("power", card.power())
				.param("toughness", card.toughness())
				.param("setCode", card.setCode())
				.param("setName", card.setName())
				.param("collectorNumber", card.collectorNumber())
				.param("rarity", card.rarity())
				.param("artist", card.artist())
				.param("priceUsd", card.priceUsd())
				.param("imageSmall", card.imageSmall())
				.param("imageNormal", card.imageNormal())
				.param("imageArtCrop", card.imageArtCrop())
				.param("commanderLegality", card.commanderLegality())
				.update();
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
				rs.getString("power"),
				rs.getString("toughness"),
				rs.getString("set_code"),
				rs.getString("set_name"),
				rs.getString("collector_number"),
				rs.getString("rarity"),
				rs.getString("artist"),
				io.eregion.common.Sql.nullableDouble(rs, "price_usd"),
				rs.getString("image_small"),
				rs.getString("image_normal"),
				rs.getString("image_art_crop"),
				rs.getString("commander_legality"),
				rs.getString("role"),
				rs.getString("role_source"),
				FunctionalTagSql.secondary(rs));
	}
}
