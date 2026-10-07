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
		return search(scryfallQuery, "name", "asc", false, max);
	}

	private List<ScryfallCard> search(String scryfallQuery, String order, String dir, boolean prints, int max) {
		throttle();
		ScryfallList body = http.get()
				.uri(uri -> uri.path("/cards/search")
						.queryParam("q", scryfallQuery)
						.queryParam("unique", prints ? "prints" : "cards")
						.queryParam("order", order)
						.queryParam("dir", dir)
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

	/** Fuzzy name lookup, for typos and names that are close but not exact. */
	public Optional<ScryfallCard> fuzzy(String name) {
		throttle();
		ScryfallCard body = http.get()
				.uri(uri -> uri.path("/cards/named").queryParam("fuzzy", name).build())
				.retrieve()
				.onStatus(status -> status.value() == 404, (request, response) -> {
					// Unknown or ambiguous names answer 404 with an error object, filtered below.
				})
				.body(ScryfallCard.class);
		return Optional.ofNullable(body).filter(card -> card.id() != null);
	}

	/** Every English paper printing of a card, newest first. */
	public List<ScryfallCard> printings(String exactName, int max) {
		String safe = exactName.replace("\"", " ").trim();
		return search("!\"" + safe + "\" game:paper lang:en", "released", "desc", true, max);
	}

	public record CollectionResult(List<ScryfallCard> data, List<NameIdentifier> not_found) {
	}

	public record NameIdentifier(String name) {
	}

	private record CollectionRequest(List<java.util.Map<String, String>> identifiers) {
	}

	/** Looks up to 75 cards by name in one request. Names Scryfall does not know come back in not_found. */
	public CollectionResult collection(List<String> names) {
		return lookup(names.stream().map(name -> java.util.Map.of("name", name)).toList());
	}

	/** Looks up to 75 cards by Scryfall id, which is how stored prices are refreshed. */
	public CollectionResult collectionByIds(List<java.util.UUID> ids) {
		return lookup(ids.stream().map(id -> java.util.Map.of("id", id.toString())).toList());
	}

	private CollectionResult lookup(List<java.util.Map<String, String>> identifiers) {
		throttle();
		CollectionRequest request = new CollectionRequest(identifiers);
		CollectionResult body = http.post()
				.uri("/cards/collection")
				.contentType(MediaType.APPLICATION_JSON)
				.body(request)
				.retrieve()
				.body(CollectionResult.class);
		if (body == null) {
			return new CollectionResult(List.of(), List.of());
		}
		return new CollectionResult(
				body.data() == null ? List.of() : body.data().stream().filter(card -> card.id() != null).toList(),
				body.not_found() == null ? List.of() : body.not_found());
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
