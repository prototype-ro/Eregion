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
		String imageArtCrop) {
}
