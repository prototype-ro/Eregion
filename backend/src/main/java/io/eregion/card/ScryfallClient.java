package io.eregion.card;

import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class ScryfallClient {

	/** Scryfall asks for 50 to 100 ms between requests. Every call through this client keeps that gap. */
	private static final long MIN_GAP_MS = 110;

	private final RestClient http;
	private long lastCallAt;

	public ScryfallClient(@Value("${eregion.scryfall.user-agent}") String userAgent) {
		this.http = RestClient.builder()
				.baseUrl("https://api.scryfall.com")
				.defaultHeader("User-Agent", userAgent)
				.defaultHeader("Accept", MediaType.APPLICATION_JSON_VALUE)
				.build();
	}

	/**
	 * Exact-name lookup. Scryfall answers 404 with an error object for unknown names,
	 * which deserializes to a card with no id, so it is filtered out here.
	 */
	public Optional<ScryfallCard> named(String exactName) {
		throttle();
		ScryfallCard body = http.get()
				.uri(uri -> uri.path("/cards/named").queryParam("exact", exactName).build())
				.retrieve()
				.onStatus(status -> status.value() == 404, (request, response) -> {
					// Not an error for us: see the filter below.
				})
				.body(ScryfallCard.class);
		return Optional.ofNullable(body).filter(card -> card.id() != null);
	}

	/** Name search, one card per name, alphabetical, capped at {@code max}. No matches is an empty list. */
	public List<ScryfallCard> search(String scryfallQuery, int max) {
		throttle();
		ScryfallList body = http.get()
				.uri(uri -> uri.path("/cards/search")
						.queryParam("q", scryfallQuery)
						.queryParam("unique", "cards")
						.queryParam("order", "name")
						.build())
				.retrieve()
				.onStatus(status -> status.value() == 404, (request, response) -> {
					// "No cards match" comes back as 404 with an error object that has no data.
				})
				.body(ScryfallList.class);
		if (body == null || body.data() == null) {
			return List.of();
		}
		return body.data().stream().filter(card -> card.id() != null).limit(max).toList();
	}

	private synchronized void throttle() {
		long wait = lastCallAt + MIN_GAP_MS - System.currentTimeMillis();
		if (wait > 0) {
			try {
				Thread.sleep(wait);
			}
			catch (InterruptedException ex) {
				Thread.currentThread().interrupt();
			}
		}
		lastCallAt = System.currentTimeMillis();
	}
}
