package io.eregion.card;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Keeps prices current. Every few hours it re-reads the price of cards (and of printings that a
 * deck has pinned) that have not been refreshed for a day, 75 per Scryfall request.
 * Cards that were imported before prices existed have never been read, so they go first.
 */
@Service
public class PriceRefreshService {

	private static final Logger log = LoggerFactory.getLogger(PriceRefreshService.class);
	private static final int BATCH = 75;

	private final CardRepository cards;
	private final PrintingRepository printings;
	private final ScryfallClient scryfall;
	private final int staleHours;
	private final int perRun;

	public PriceRefreshService(CardRepository cards, PrintingRepository printings, ScryfallClient scryfall,
			@Value("${eregion.prices.stale-hours:24}") int staleHours,
			@Value("${eregion.prices.per-run:600}") int perRun) {
		this.cards = cards;
		this.printings = printings;
		this.scryfall = scryfall;
		this.staleHours = staleHours;
		this.perRun = perRun;
	}

	@Scheduled(initialDelayString = "${eregion.prices.initial-delay-ms:5000}", fixedDelayString = "${eregion.prices.every-ms:21600000}")
	public void refresh() {
		try {
			int cardCount = refreshCards();
			int printingCount = refreshPrintings();
			if (cardCount + printingCount > 0) {
				log.info("Refreshed prices for {} cards and {} pinned printings", cardCount, printingCount);
			}
		}
		catch (RuntimeException ex) {
			// A failed run just tries again at the next interval.
			log.warn("Price refresh failed", ex);
		}
	}

	int refreshCards() {
		List<UUID> stale = cards.staleForPrices(staleHours, perRun);
		int done = 0;
		for (int start = 0; start < stale.size(); start += BATCH) {
			List<UUID> batch = stale.subList(start, Math.min(start + BATCH, stale.size()));
			for (ScryfallCard found : scryfall.collectionByIds(batch).data()) {
				cards.upsert(ScryfallMapper.toCard(found));
				done++;
			}
		}
		return done;
	}

	int refreshPrintings() {
		List<UUID> stale = printings.pinnedStale(staleHours, perRun);
		Map<UUID, UUID> owners = printings.cardIds(stale);
		int done = 0;
		for (int start = 0; start < stale.size(); start += BATCH) {
			List<UUID> batch = stale.subList(start, Math.min(start + BATCH, stale.size()));
			for (ScryfallCard found : scryfall.collectionByIds(batch).data()) {
				UUID cardId = owners.get(UUID.fromString(found.id()));
				if (cardId != null) {
					printings.upsert(ScryfallMapper.toPrinting(found, cardId));
					done++;
				}
			}
		}
		return done;
	}
}
