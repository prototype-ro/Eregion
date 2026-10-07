package io.eregion.card;

import java.util.List;
import java.util.UUID;

import io.eregion.card.ScryfallCard.Face;
import io.eregion.card.ScryfallCard.ImageUris;

/** Turns a Scryfall card into our card row. Double-faced cards use the front face. */
public final class ScryfallMapper {

	private static final String WUBRG = "WUBRG";

	private ScryfallMapper() {
	}

	public static Card toCard(ScryfallCard source) {
		Face front = source.card_faces() == null || source.card_faces().isEmpty() ? null : source.card_faces().get(0);

		String typeLine = firstNonBlank(source.type_line(), front == null ? null : front.type_line(), "");
		String manaCost = firstNonBlank(source.mana_cost(), front == null ? null : front.mana_cost(), "");
		String oracle = firstNonBlank(source.oracle_text(), front == null ? null : front.oracle_text(), "");
		String artist = firstNonBlank(source.artist(), front == null ? null : front.artist(), "");
		ImageUris images = source.image_uris() != null ? source.image_uris() : front == null ? null : front.image_uris();

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
				orEmpty(source.set()),
				orEmpty(source.set_name()),
				orEmpty(source.collector_number()),
				orEmpty(source.rarity()),
				artist,
				price(source.prices()),
				images == null ? "" : orEmpty(images.small()),
				images == null ? "" : orEmpty(images.normal()),
				images == null ? "" : orEmpty(images.art_crop()));
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
