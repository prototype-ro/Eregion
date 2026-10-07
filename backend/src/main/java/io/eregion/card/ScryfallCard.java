package io.eregion.card;

import java.util.List;

/**
 * The slice of Scryfall's card JSON we read. Component names match Scryfall's
 * snake_case fields on purpose, so no JSON annotations are needed. Unknown fields
 * are ignored.
 */
@SuppressWarnings("checkstyle:MemberName")
public record ScryfallCard(
		String id,
		String name,
		String mana_cost,
		Double cmc,
		String type_line,
		List<String> colors,
		List<String> color_identity,
		String oracle_text,
		String set,
		String set_name,
		String collector_number,
		String released_at,
		String rarity,
		String artist,
		Prices prices,
		ImageUris image_uris,
		List<Face> card_faces) {

	public record ImageUris(String small, String normal, String art_crop) {
	}

	/** Scryfall sends prices as strings, and null when there is no market price. */
	public record Prices(String usd, String usd_foil, String usd_etched) {
	}

	public record Face(
			String name,
			String mana_cost,
			String type_line,
			String oracle_text,
			String artist,
			ImageUris image_uris) {
	}
}
