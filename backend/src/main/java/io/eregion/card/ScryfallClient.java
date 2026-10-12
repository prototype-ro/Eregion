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
	/** The gap the background tag sync keeps between its requests: wider than a user's, so a person searching is never stuck behind it. */
	private final long syncGapMs;

	public ScryfallClient(@Value("${eregion.scryfall.user-agent}") String userAgent,
			@Value("${eregion.scryfall.sync-gap-ms:250}") long syncGapMs) {
		this.syncGapMs = syncGapMs;
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

	/**
	 * The names of every card a search matches, following Scryfall's pages until they run out or {@code maxPages} is reached.
	 * Used by the functional tag sync, where one tag can have thousands of cards. A search that matches nothing is an empty list.
	 */
	public List<String> searchNames(String scryfallQuery, int maxPages) {
		List<String> names = new java.util.ArrayList<>();
		ScryfallList page = backingOff(() -> http.get()
				.uri(uri -> uri.path("/cards/search")
						.queryParam("q", scryfallQuery)
						.queryParam("unique", "cards")
						.queryParam("order", "name")
						.build())
				.retrieve()
				.onStatus(status -> status.value() == 404, (request, response) -> {
					// "No cards match" comes back as 404 with an error object that has no data.
				})
				.body(ScryfallList.class));
		for (int fetched = 1; page != null && page.data() != null; fetched++) {
			page.data().stream().filter(card -> card.id() != null).forEach(card -> names.add(card.name()));
			if (!Boolean.TRUE.equals(page.has_more()) || page.next_page() == null || fetched >= maxPages) {
				break;
			}
			String next = page.next_page();
			page = backingOff(() -> http.get().uri(java.net.URI.create(next)).retrieve().body(ScryfallList.class));
		}
		return names;
	}

	/** Runs a request through the throttle. When Scryfall answers 429 it waits as long as it asks, then tries again a few times. */
	private <T> T backingOff(java.util.function.Supplier<T> request) {
		for (int attempt = 1;; attempt++) {
			throttle(syncGapMs);
			try {
				return request.get();
			}
			catch (org.springframework.web.client.HttpClientErrorException.TooManyRequests ex) {
				if (attempt >= 4) {
					throw ex;
				}
				String after = ex.getResponseHeaders() == null ? null : ex.getResponseHeaders().getFirst("Retry-After");
				long seconds = after != null && after.matches("\\d+") ? Long.parseLong(after) : 30L * attempt;
				try {
					Thread.sleep(Math.min(seconds, 120) * 1000);
				}
				catch (InterruptedException interrupted) {
					Thread.currentThread().interrupt();
					throw ex;
				}
			}
		}
	}

	/**
	 * One page (up to 175 cards) of a search, one card per name, in the order asked for. Scryfall's own page number is used, so the
	 * caller pages through it. No matches is an empty list. A search Scryfall cannot read raises a 400 error.
	 */
	public ScryfallList searchPage(String scryfallQuery, String order, String dir, int page) {
		throttle();
		ScryfallList body = http.get()
				.uri(uri -> uri.path("/cards/search")
						.queryParam("q", scryfallQuery)
						.queryParam("unique", "cards")
						.queryParam("order", order)
						.queryParam("dir", dir)
						.queryParam("page", page)
						.build())
				.retrieve()
				.onStatus(status -> status.value() == 404, (request, response) -> {
					// "No cards match" comes back as 404 with an error object that has no data.
				})
				.body(ScryfallList.class);
		return body == null ? new ScryfallList(List.of(), false, null, 0) : body;
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

	private void throttle() {
		throttle(MIN_GAP_MS);
	}

	private synchronized void throttle(long gapMs) {
		long wait = lastCallAt + gapMs - System.currentTimeMillis();
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
