package io.eregion.card;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
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
		// Each distinct spelling is answered, so "sol ring" and "Sol Ring" in one list both get their card.
		Map<String, String> spellings = new LinkedHashMap<>();
		for (String name : requested) {
			String trimmed = name == null ? "" : name.trim();
			if (!trimmed.isEmpty()) {
				spellings.putIfAbsent(trimmed, trimmed);
			}
		}
		// Names that mean the same card once case, accents and quotes are ignored are looked up once.
		Map<String, String> byKey = new LinkedHashMap<>();
		spellings.values().forEach(spelling -> byKey.putIfAbsent(NameNormalizer.normalize(spelling), NameNormalizer.forSearch(spelling)));

		Set<String> known = knownKeys(byKey.keySet());
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
				scryfall.fuzzy(name).ifPresent(card -> fuzzy.put(NameNormalizer.normalize(name), cards.upsert(ScryfallMapper.toCard(card))));
			}
			catch (RuntimeException ex) {
				log.warn("Fuzzy lookup failed for '{}'", name, ex);
			}
		}

		Map<String, Card> catalog = new LinkedHashMap<>();
		for (Card card : cards.findByNames(byKey.keySet())) {
			keysOf(card.name()).forEach(key -> catalog.putIfAbsent(key, card));
		}

		List<Match> matches = new ArrayList<>();
		List<String> notFound = new ArrayList<>();
		for (String spelling : spellings.values()) {
			String key = NameNormalizer.normalize(spelling);
			Card card = catalog.getOrDefault(key, fuzzy.get(key));
			if (card == null) {
				notFound.add(spelling);
			}
			else {
				matches.add(new Match(spelling, card));
			}
		}
		return new Result(List.copyOf(matches), List.copyOf(notFound));
	}

	private Set<String> knownKeys(java.util.Collection<String> keys) {
		return cards.findByNames(keys).stream()
				.flatMap(card -> keysOf(card.name()).stream())
				.collect(Collectors.toSet());
	}

	/** A card is known by its full name, and a double-faced card also by its front face. */
	static Set<String> keysOf(String name) {
		String normal = NameNormalizer.normalize(name);
		int split = normal.indexOf(" // ");
		return split < 0 ? Set.of(normal) : Set.of(normal, normal.substring(0, split));
	}
}
