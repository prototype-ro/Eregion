package io.eregion.card;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import io.eregion.common.ApiException;

/** The printings of a card, filled from Scryfall the first time they are asked for and refreshed weekly. */
@Service
public class PrintingService {

	private static final Logger log = LoggerFactory.getLogger(PrintingService.class);
	private static final Duration FRESH_FOR = Duration.ofDays(7);
	private static final int MAX_PRINTINGS = 120;

	private final CardRepository cards;
	private final PrintingRepository printings;
	private final ScryfallClient scryfall;

	public PrintingService(CardRepository cards, PrintingRepository printings, ScryfallClient scryfall) {
		this.cards = cards;
		this.printings = printings;
		this.scryfall = scryfall;
	}

	public List<Printing> forCard(UUID cardId) {
		Card card = cards.findById(cardId).orElseThrow(() -> ApiException.notFound("Card"));
		boolean stale = printings.lastFetched(cardId).map(at -> at.isBefore(Instant.now().minus(FRESH_FOR))).orElse(true);
		if (stale) {
			try {
				for (ScryfallCard found : scryfall.printings(card.name(), MAX_PRINTINGS)) {
					printings.upsert(ScryfallMapper.toPrinting(found, cardId));
				}
			}
			catch (RuntimeException ex) {
				// Serve whatever is stored rather than failing the picker.
				log.warn("Could not fetch printings for '{}'", card.name(), ex);
			}
		}
		return printings.forCard(cardId);
	}
}
