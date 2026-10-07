package io.eregion.card;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.stereotype.Service;

/**
 * Imports cards by exact name from Scryfall. Scryfall asks clients to stay under
 * roughly 10 requests per second, so lookups are spaced out.
 */
@Service
public class CardImportService {

	private static final Logger log = LoggerFactory.getLogger(CardImportService.class);

	public record ImportResult(List<String> imported, List<String> skipped, List<String> failed) {
	}

	private final ScryfallClient scryfall;
	private final CardRepository cards;
	private final long delayMs;

	public CardImportService(ScryfallClient scryfall, CardRepository cards,
			@Value("${eregion.scryfall.delay-ms}") long delayMs) {
		this.scryfall = scryfall;
		this.cards = cards;
		this.delayMs = delayMs;
	}

	public ImportResult importNames(List<String> names) {
		List<String> imported = new ArrayList<>();
		List<String> skipped = new ArrayList<>();
		List<String> failed = new ArrayList<>();

		for (String name : new LinkedHashSet<>(names.stream().map(String::trim).filter(n -> !n.isEmpty()).toList())) {
			if (cards.existsByName(name)) {
				skipped.add(name);
				continue;
			}
			try {
				Optional<ScryfallCard> found = lookup(name);
				if (found.isEmpty()) {
					failed.add(name);
				}
				else {
					Card saved = cards.upsert(ScryfallMapper.toCard(found.get()));
					imported.add(saved.name());
				}
				pause();
			}
			catch (RuntimeException ex) {
				log.warn("Scryfall import failed for '{}'", name, ex);
				failed.add(name);
			}
		}
		return new ImportResult(imported, skipped, failed);
	}

	private static final int MAX_RETRIES = 4;

	/** Scryfall answers 429 when we go too fast. Wait as long as it says, then try the same card again. */
	private Optional<ScryfallCard> lookup(String name) {
		for (int attempt = 0;; attempt++) {
			try {
				return scryfall.named(name);
			}
			catch (HttpClientErrorException.TooManyRequests ex) {
				if (attempt >= MAX_RETRIES) {
					throw ex;
				}
				long wait = retryAfterMillis(ex, attempt);
				log.info("Scryfall rate limit hit on '{}', waiting {} ms", name, wait);
				sleep(wait);
			}
		}
	}

	private static long retryAfterMillis(HttpClientErrorException ex, int attempt) {
		String header = ex.getResponseHeaders() == null ? null : ex.getResponseHeaders().getFirst("Retry-After");
		if (header != null) {
			try {
				return Math.min(30_000, Long.parseLong(header.trim()) * 1000);
			}
			catch (NumberFormatException ignored) {
				// Fall through to the default backoff.
			}
		}
		return 2_000L * (attempt + 1);
	}

	private void pause() {
		sleep(delayMs);
	}

	private static void sleep(long millis) {
		try {
			Thread.sleep(millis);
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
		}
	}
}
