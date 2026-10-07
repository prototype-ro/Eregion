package io.eregion.card;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Turns a list of card names, typically pasted from another site, into catalog cards. Names we
 * already know are answered locally, the rest go to Scryfall in batches of 75, and anything
 * Scryfall cannot place exactly gets one fuzzy attempt.
 */
@Service
public class CardResolveService {

	/** A requested name and the catalog card it turned out to be. They differ for typos and double-faced cards. */
	public record Match(String requested, Card card) {
	}

	public record Result(List<Match> matches, List<String> notFound) {
	}

	private static final Logger log = LoggerFactory.getLogger(CardResolveService.class);
	private static final int BATCH = 75;
	private static final int MAX_FUZZY = 25;

	private final CardRepository cards;
	private final ScryfallClient scryfall;

	public CardResolveService(CardRepository cards, ScryfallClient scryfall) {
		this.cards = cards;
		this.scryfall = scryfall;
	}

	public Result resolve(List<String> requested) {
		// Keep the first spelling of each name, in the order given.
		Map<String, String> byKey = new LinkedHashMap<>();
		for (String name : requested) {
			String trimmed = name == null ? "" : name.trim();
			if (!trimmed.isEmpty()) {
				byKey.putIfAbsent(trimmed.toLowerCase(Locale.ROOT), trimmed);
			}
		}

		Set<String> known = knownKeys(byKey);
		List<String> missing = byKey.entrySet().stream()
				.filter(entry -> !known.contains(entry.getKey()))
				.map(Map.Entry::getValue)
				.toList();

		List<String> stillMissing = new ArrayList<>();
		for (int start = 0; start < missing.size(); start += BATCH) {
			List<String> batch = missing.subList(start, Math.min(start + BATCH, missing.size()));
			try {
				ScryfallClient.CollectionResult found = scryfall.collection(batch);
				found.data().forEach(card -> cards.upsert(ScryfallMapper.toCard(card)));
				found.not_found().forEach(id -> stillMissing.add(id.name()));
			}
			catch (RuntimeException ex) {
				log.warn("Scryfall batch lookup failed for {} names", batch.size(), ex);
				stillMissing.addAll(batch);
			}
		}

		// Names Scryfall could not place exactly get one fuzzy try, which fixes small typos.
		Map<String, Card> fuzzy = new LinkedHashMap<>();
		int tries = 0;
		for (String name : stillMissing) {
			if (tries++ >= MAX_FUZZY) {
				break;
			}
			try {
				scryfall.fuzzy(name).ifPresent(card -> fuzzy.put(name.toLowerCase(Locale.ROOT), cards.upsert(ScryfallMapper.toCard(card))));
			}
			catch (RuntimeException ex) {
				log.warn("Fuzzy lookup failed for '{}'", name, ex);
			}
		}

		Map<String, Card> catalog = new LinkedHashMap<>();
		for (Card card : cards.findByNames(byKey.values())) {
			keysOf(card.name()).forEach(key -> catalog.putIfAbsent(key, card));
		}

		List<Match> matches = new ArrayList<>();
		List<String> notFound = new ArrayList<>();
		for (Map.Entry<String, String> entry : byKey.entrySet()) {
			Card card = catalog.getOrDefault(entry.getKey(), fuzzy.get(entry.getKey()));
			if (card == null) {
				notFound.add(entry.getValue());
			}
			else {
				matches.add(new Match(entry.getValue(), card));
			}
		}
		return new Result(List.copyOf(matches), List.copyOf(notFound));
	}

	private Set<String> knownKeys(Map<String, String> byKey) {
		return cards.findByNames(byKey.values()).stream()
				.flatMap(card -> keysOf(card.name()).stream())
				.collect(Collectors.toSet());
	}

	/** A card is known by its full name, and a double-faced card also by its front face. */
	static Set<String> keysOf(String name) {
		String lower = name.toLowerCase(Locale.ROOT);
		int split = lower.indexOf(" // ");
		return split < 0 ? Set.of(lower) : Set.of(lower, lower.substring(0, split));
	}
}
