package io.eregion.card;

import java.util.UUID;

public record Card(
		UUID id,
		UUID scryfallId,
		String name,
		String manaCost,
		double manaValue,
		String typeLine,
		String primaryType,
		String colors,
		String colorIdentity,
		String oracleText,
		String setCode,
		String setName,
		String collectorNumber,
		String rarity,
		String artist,
		Double priceUsd,
		String imageSmall,
		String imageNormal,
		String imageArtCrop,
		/** legal, not_legal or banned in Commander, or unknown until read from Scryfall. */
		String commanderLegality,
		/** What the card does in a deck (Ramp, Removal, ...) when the functional tag sync knows, otherwise null. */
		String role,
		/** Where that role came from: scryfall (community tagged) or regex (a guess from the rules text). */
		String roleSource,
		/** The card's other roles, informational only: they are never counted. */
		java.util.List<String> secondaryRoles) {

	/** A card with no role, which is what a card read from Scryfall is until the tag sync has seen it. */
	public Card(UUID id, UUID scryfallId, String name, String manaCost, double manaValue, String typeLine, String primaryType, String colors,
			String colorIdentity, String oracleText, String setCode, String setName, String collectorNumber, String rarity, String artist,
			Double priceUsd, String imageSmall, String imageNormal, String imageArtCrop, String commanderLegality) {
		this(id, scryfallId, name, manaCost, manaValue, typeLine, primaryType, colors, colorIdentity, oracleText, setCode, setName,
				collectorNumber, rarity, artist, priceUsd, imageSmall, imageNormal, imageArtCrop, commanderLegality, null, null, java.util.List.of());
	}
}
