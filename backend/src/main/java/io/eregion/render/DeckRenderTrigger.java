package io.eregion.render;

import java.util.UUID;

import org.springframework.stereotype.Component;

import io.eregion.deck.DeckRepository;

/**
 * Re-renders every card in a deck that has custom art, after something deck-wide changes a render input (today:
 * a deck's frame-settings save). Deck-card membership is read from the deck's most recently saved version, on
 * whichever branch -- the same "current cards" definition DeckService already uses elsewhere for editing
 * (findLatestVersion), surfaced here as DeckRepository.currentCardIds. Art comes from ArtLookup's
 * most-recently-uploaded-for-this-card fallback (see its Javadoc for why a card-only lookup can't honor the
 * deck-line pin at deck_version_cards.custom_printing_id); cards with no uploaded art at all are skipped.
 */
@Component
public class DeckRenderTrigger {

	private final CardRenderService cardRenderService;
	private final ArtLookup artLookup;
	private final DeckRepository decks;

	public DeckRenderTrigger(CardRenderService cardRenderService, ArtLookup artLookup, DeckRepository decks) {
		this.cardRenderService = cardRenderService;
		this.artLookup = artLookup;
		this.decks = decks;
	}

	public void rerenderDeck(UUID deckId) {
		for (UUID cardId : decks.currentCardIds(deckId)) {
			byte[] artBytes = artLookup.findArtBytes(cardId);
			if (artBytes != null) {
				cardRenderService.render(deckId, cardId, artBytes);
			}
		}
	}
}
