package io.eregion.card;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import io.eregion.common.ApiException;

/**
 * Searches the whole of Scryfall by anything it can filter on, and saves what comes back so every card has an id the deck API
 * understands. Unlike the name search, this cannot be answered from our own catalogue, which only holds cards somebody has used.
 * Answers are remembered for a few minutes, since the same search is often sent again as someone pages back and forth.
 */
@Service
public class AdvancedSearchService {

	private static final Logger log = LoggerFactory.getLogger(AdvancedSearchService.class);
	private static final Duration REMEMBER = Duration.ofMinutes(10);
	private static final int MAX_REMEMBERED = 300;
	/** Scryfall pages hold 175 cards, which is plenty to scroll through, so deep paging is not offered. */
	private static final int MAX_PAGE = 20;

	/** What the search page shows: the cards of this page, how many matched in all, and whether there is another page. */
	public record Result(List<Card> cards, int total, boolean hasMore, String query) {
	}

	private record Remembered(Result result, Instant at) {
	}

	private final CardRepository cards;
	private final ScryfallClient scryfall;
	private final FunctionalTagMapping mapping = FunctionalTagMapping.load();
	private final Map<String, Remembered> remembered = new ConcurrentHashMap<>();

	public AdvancedSearchService(CardRepository cards, ScryfallClient scryfall) {
		this.cards = cards;
		this.scryfall = scryfall;
	}

	/** The role names that can be searched for: the main ones first, then the long tail. */
	public List<String> roles() {
		List<String> names = new ArrayList<>(mapping.names());
		mapping.longTail().forEach(role -> names.add(role.name()));
		return names;
	}

	public Result search(String text, boolean legalInCommander, String role, String order, String direction, int page) {
		List<String> tags = roleTags(role);
		String query = AdvancedSearchQuery.build(text, legalInCommander, tags);
		if (query == null) {
			throw ApiException.badRequest("Add at least one filter to search for");
		}
		String sort = AdvancedSearchQuery.order(order);
		String dir = AdvancedSearchQuery.direction(direction);
		int pageNumber = Math.max(1, Math.min(page, MAX_PAGE));

		String key = query + "|" + sort + "|" + dir + "|" + pageNumber;
		Remembered known = remembered.get(key);
		if (known != null && known.at().isAfter(Instant.now().minus(REMEMBER))) {
			return known.result();
		}

		ScryfallList found;
		try {
			found = scryfall.searchPage(query, sort, dir, pageNumber);
		}
		catch (HttpClientErrorException.BadRequest ex) {
			throw ApiException.badRequest("Scryfall could not read that search. Check the syntax.");
		}
		catch (RuntimeException ex) {
			log.warn("Advanced search failed for '{}'", query, ex);
			throw ApiException.unavailable("Card search is busy. Try again in a moment.");
		}

		List<Card> saved = new ArrayList<>();
		if (found.data() != null) {
			for (ScryfallCard card : found.data()) {
				if (card.id() != null) {
					saved.add(cards.upsert(ScryfallMapper.toCard(card)));
				}
			}
		}
		Result result = new Result(saved, found.total_cards() == null ? saved.size() : found.total_cards(), Boolean.TRUE.equals(found.has_more()), query);
		if (remembered.size() > MAX_REMEMBERED) {
			remembered.clear();
		}
		remembered.put(key, new Remembered(result, Instant.now()));
		return result;
	}

	/** The Scryfall tags behind a role name, or none when no role was asked for. An unknown role is an error, not an empty search. */
	List<String> roleTags(String role) {
		if (role == null || role.isBlank()) {
			return List.of();
		}
		List<FunctionalTagMapping.Category> all = new ArrayList<>(mapping.categories());
		all.addAll(mapping.longTail());
		return all.stream()
				.filter(category -> category.name().equalsIgnoreCase(role.trim()))
				.findFirst()
				.map(FunctionalTagMapping.Category::tags)
				.orElseThrow(() -> ApiException.badRequest("Unknown role"));
	}
}
