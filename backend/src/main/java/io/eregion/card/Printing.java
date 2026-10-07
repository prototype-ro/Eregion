package io.eregion.card;

import java.util.UUID;

/**
 * One printing of a card. scryfallId identifies the printing, cardId the card it belongs to.
 * releasedAt is an ISO date or null.
 */
public record Printing(
		UUID scryfallId,
		UUID cardId,
		String setCode,
		String setName,
		String collectorNumber,
		String releasedAt,
		String rarity,
		String artist,
		String imageSmall,
		String imageNormal,
		String imageArtCrop,
		Double priceUsd) {
}
