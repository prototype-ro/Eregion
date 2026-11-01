package io.eregion.render;

import java.util.UUID;

import org.springframework.stereotype.Component;

import io.eregion.custom.CustomPrintingRepository;

/**
 * Resolves "the" art to use for a card when re-rendering, for callers that have only a card id (no specific
 * upload already in hand, and no deck in scope to consult a per-deck-line pin). A card can have multiple custom
 * printings (CustomPrinting is not deck-scoped in its own table), and the closest thing to a "current art" flag
 * in the codebase -- deck_version_cards.custom_printing_id, which a deck line pins explicitly via the
 * PrintingPicker/CustomArtSection frontend flow -- is deck-scoped and can't be honored by a card-only lookup.
 * So this follows the plan's documented fallback instead: the most recently uploaded custom printing for the
 * card, globally. See CardRenderService's and DeckRenderTrigger's Javadoc for where that's a real, flagged
 * limitation.
 */
@Component
public class ArtLookup {

	private final CustomPrintingRepository customPrintingRepository;

	public ArtLookup(CustomPrintingRepository customPrintingRepository) {
		this.customPrintingRepository = customPrintingRepository;
	}

	public byte[] findArtBytes(UUID cardId) {
		return customPrintingRepository.latestImageForCard(cardId).orElse(null);
	}
}
