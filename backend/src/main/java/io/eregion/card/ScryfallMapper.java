package io.eregion.card;

import java.util.List;
import java.util.UUID;

import io.eregion.card.ScryfallCard.Face;
import io.eregion.card.ScryfallCard.ImageUris;

/**
 * Turns a Scryfall card into our card row. A transform or modal DFC only shows one face at a time, so those use the
 * front face for type/mana/art. A split, aftermath or adventure card prints both halves on the one face shown, and
 * Scryfall gives their combined type line and mana cost at the top level already — only {@code oracle_text} is left
 * null there, so that one field is built from every face's own text, or a card's second half would be silently lost.
 */
public final class ScryfallMapper {

	private static final String WUBRG = "WUBRG";

	private ScryfallMapper() {
	}

	public static Card toCard(ScryfallCard source) {
		Face front = source.card_faces() == null || source.card_faces().isEmpty() ? null : source.card_faces().get(0);

		String typeLine = firstNonBlank(source.type_line(), front == null ? null : front.type_line(), "");
		String manaCost = firstNonBlank(source.mana_cost(), front == null ? null : front.mana_cost(), "");
		String oracle = combinedOracleText(source);
		String artist = firstNonBlank(source.artist(), front == null ? null : front.artist(), "");
		ImageUris images = source.image_uris() != null ? source.image_uris() : front == null ? null : front.image_uris();
		String power = source.power() != null ? source.power() : front == null ? null : front.power();
		String toughness = source.toughness() != null ? source.toughness() : front == null ? null : front.toughness();

		return new Card(
				null,
				UUID.fromString(source.id()),
				source.name(),
				manaCost,
				source.cmc() == null ? 0 : source.cmc(),
				typeLine,
				primaryType(typeLine),
				colorString(source.colors()),
				colorString(source.color_identity()),
				oracle,
				power,
				toughness,
				orEmpty(source.set()),
				orEmpty(source.set_name()),
				orEmpty(source.collector_number()),
				orEmpty(source.rarity()),
				artist,
				price(source.prices()),
				images == null ? "" : orEmpty(images.small()),
				images == null ? "" : orEmpty(images.normal()),
				images == null ? "" : orEmpty(images.art_crop()),
				commanderLegality(source),
				null,
				null,
				List.of());
	}

	/**
	 * The top-level {@code oracle_text} when Scryfall gives one (most cards). Otherwise this is a double-faced card
	 * of some kind, and which faces to read depends on which: a transform or modal DFC shows only one face at a
	 * time, and Scryfall leaves {@code type_line}/{@code mana_cost} null at the top level too for those, so the
	 * front face alone is read there (matching {@code typeLine}/{@code manaCost} above). A split, aftermath or
	 * adventure card prints both halves on the one face shown, and Scryfall gives their combined type line and mana
	 * cost at the top level — only {@code oracle_text} is left null — so every face's text is joined there, or a
	 * card's second half (a copy-limit exception, a keyword) would be silently missing from everything downstream
	 * that reads it, such as the deck's legality checks.
	 */
	static String combinedOracleText(ScryfallCard source) {
		if (source.oracle_text() != null && !source.oracle_text().isBlank()) {
			return source.oracle_text();
		}
		List<Face> faces = source.card_faces();
		if (faces == null || faces.isEmpty()) {
			return "";
		}
		if (source.type_line() == null || source.type_line().isBlank()) {
			String front = faces.get(0).oracle_text();
			return front == null ? "" : front;
		}
		StringBuilder out = new StringBuilder();
		for (Face face : faces) {
			if (face.oracle_text() != null && !face.oracle_text().isBlank()) {
				if (!out.isEmpty()) {
					out.append("\n // \n");
				}
				out.append(face.oracle_text());
			}
		}
		return out.toString();
	}

	/** What Scryfall says about Commander. unknown when it says nothing, so a missing answer is never read as banned. */
	static String commanderLegality(ScryfallCard source) {
		String value = source.legalities() == null ? null : source.legalities().get("commander");
		return switch (value == null ? "" : value) {
			case "legal", "restricted" -> "legal";
			case "banned" -> "banned";
			case "not_legal" -> "not_legal";
			default -> "unknown";
		};
	}

	/** One printing of a card, as returned for the printing picker. */
	public static Printing toPrinting(ScryfallCard source, java.util.UUID cardId) {
		Face front = source.card_faces() == null || source.card_faces().isEmpty() ? null : source.card_faces().get(0);
		ImageUris images = source.image_uris() != null ? source.image_uris() : front == null ? null : front.image_uris();
		return new Printing(
				UUID.fromString(source.id()),
				cardId,
				orEmpty(source.set()),
				orEmpty(source.set_name()),
				orEmpty(source.collector_number()),
				source.released_at() == null || source.released_at().isBlank() ? null : source.released_at(),
				orEmpty(source.rarity()),
				firstNonBlank(source.artist(), front == null ? null : front.artist(), ""),
				images == null ? "" : orEmpty(images.small()),
				images == null ? "" : orEmpty(images.normal()),
				images == null ? "" : orEmpty(images.art_crop()),
				price(source.prices()));
	}

	/** Regular price first, then foil or etched for cards that only exist in those finishes. */
	static Double price(ScryfallCard.Prices prices) {
		if (prices == null) {
			return null;
		}
		for (String value : new String[] { prices.usd(), prices.usd_foil(), prices.usd_etched() }) {
			if (value != null && !value.isBlank()) {
				try {
					return Double.valueOf(value);
				}
				catch (NumberFormatException ignored) {
					// Try the next finish.
				}
			}
		}
		return null;
	}

	/**
	 * The one type a card is grouped under in the builder. Land wins over Creature
	 * (Dryad Arbor is a land), and Artifact Creature counts as a Creature.
	 */
	public static String primaryType(String typeLine) {
		String front = typeLine.contains("//") ? typeLine.substring(0, typeLine.indexOf("//")) : typeLine;
		for (String type : List.of("Land", "Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact",
				"Enchantment")) {
			if (front.contains(type)) {
				return type;
			}
		}
		return "Other";
	}

	static String colorString(List<String> colors) {
		if (colors == null) {
			return "";
		}
		StringBuilder out = new StringBuilder();
		for (char symbol : WUBRG.toCharArray()) {
			if (colors.contains(String.valueOf(symbol))) {
				out.append(symbol);
			}
		}
		return out.toString();
	}

	private static String firstNonBlank(String... values) {
		for (String value : values) {
			if (value != null && !value.isBlank()) {
				return value;
			}
		}
		return "";
	}

	private static String orEmpty(String value) {
		return value == null ? "" : value;
	}
}
