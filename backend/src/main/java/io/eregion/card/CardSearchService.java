package io.eregion.card;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Card search that grows the catalog as people use it. It answers from our own
 * catalog first. When that gives fewer results than asked for, it also searches
 * Scryfall, saves what it finds, and answers from the catalog again, so every card
 * returned has an id the deck API understands.
 */
@Service
public class CardSearchService {

	private static final Logger log = LoggerFactory.getLogger(CardSearchService.class);
	private static final Duration REMEMBER = Duration.ofHours(1);
	private static final int MAX_REMEMBERED = 5_000;
	private static final int MAX_FROM_SCRYFALL = 15;

	private final CardRepository cards;
	private final ScryfallClient scryfall;
	/** Searches already sent to Scryfall recently, so repeated typing does not repeat the call. */
	private final Map<String, Instant> asked = new ConcurrentHashMap<>();

	public CardSearchService(CardRepository cards, ScryfallClient scryfall) {
		this.cards = cards;
		this.scryfall = scryfall;
	}

	public List<Card> search(String raw, int limit) {
		String cleaned = ScryfallQuery.sanitize(raw);
		if (cleaned.isEmpty()) {
			return List.of();
		}

		List<Card> local = cards.search(cleaned, limit);
		if (local.size() >= limit || recentlyAsked(cleaned)) {
			return local;
		}

		try {
			for (ScryfallCard found : scryfall.search(ScryfallQuery.toScryfall(cleaned), MAX_FROM_SCRYFALL)) {
				cards.upsert(ScryfallMapper.toCard(found));
			}
			remember(cleaned);
		}
		catch (RuntimeException ex) {
			// Scryfall being slow or down must not break search: fall back to what we have.
			log.warn("Scryfall search failed for '{}', answering from the local catalog", cleaned, ex);
			return local;
		}
		return cards.search(cleaned, limit);
	}

	private boolean recentlyAsked(String cleaned) {
		Instant when = asked.get(key(cleaned));
		return when != null && when.isAfter(Instant.now().minus(REMEMBER));
	}

	private void remember(String cleaned) {
		if (asked.size() > MAX_REMEMBERED) {
			asked.clear();
		}
		asked.put(key(cleaned), Instant.now());
	}

	private static String key(String cleaned) {
		return cleaned.toLowerCase(Locale.ROOT);
	}
}
