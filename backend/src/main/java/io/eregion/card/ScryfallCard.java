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
		String rarity,
		String artist,
		ImageUris image_uris,
		List<Face> card_faces) {

	public record ImageUris(String small, String normal, String art_crop) {
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
