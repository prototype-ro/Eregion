package io.eregion.deck;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.random.RandomGenerator;

import org.springframework.stereotype.Service;

import io.eregion.card.ScryfallCard;
import io.eregion.card.ScryfallClient;
import io.eregion.card.ScryfallList;
import io.eregion.deck.BackdropRepository.Backdrop;

/**
 * Art Series cards, searched on Scryfall: they are left out of the local catalog because they cannot be played. Results are
 * kept for a few hours, so the same search does not reach Scryfall again.
 */
@Service
public class ArtSeries {

	private static final Duration KEEP = Duration.ofHours(6);
	private static final int MAX_KEPT = 300;
	private static final int MAX_RESULTS = 30;
	private static final String ALL = "layout:art-series";
	private static final int POOL_PAGES = 3; // Scryfall pages (175 cards each) kept for drawing random cards
	private static final Duration POOL_KEEP = Duration.ofHours(24);

	private record Kept(List<Backdrop> found, Instant until) {
	}

	private final ScryfallClient scryfall;
	private final Map<String, Kept> kept = new ConcurrentHashMap<>();
	// Art Series cards to draw from, so a shuffle needs no call to Scryfall. Rebuilt once a day from other pages.
	private volatile Kept pool = new Kept(List.of(), Instant.EPOCH);

	public ArtSeries(ScryfallClient scryfall) {
		this.scryfall = scryfall;
	}

	/** Art Series cards whose name contains the text. Text under two letters finds nothing. */
	public List<Backdrop> search(String text) {
		String q = query(text);
		if (q == null) {
			return List.of();
		}
		Kept hit = kept.get(q);
		if (hit != null && hit.until().isAfter(Instant.now())) {
			return hit.found();
		}
		List<Backdrop> found = scryfall.search(q, MAX_RESULTS).stream().map(ArtSeries::toBackdrop).flatMap(Optional::stream).toList();
		if (kept.size() >= MAX_KEPT) {
			kept.clear();
		}
		kept.put(q, new Kept(found, Instant.now().plus(KEEP)));
		return found;
	}

	/** A few Art Series cards at random, for players who know none by name. */
	public List<Backdrop> random(int count) {
		return pick(pool(), count, ThreadLocalRandom.current());
	}

	private synchronized List<Backdrop> pool() {
		if (pool.until().isAfter(Instant.now()) && !pool.found().isEmpty()) {
			return pool.found();
		}
		List<Backdrop> found = new ArrayList<>();
		ScryfallList first = scryfall.searchPage(ALL, "released", "desc", 1);
		first.data().stream().map(ArtSeries::toBackdrop).flatMap(Optional::stream).forEach(found::add);
		int pages = first.total_cards() == null ? 1 : Math.max(1, (first.total_cards() + 174) / 175);
		// The first page holds the newest sets; a couple of other pages, picked at random, bring in older ones.
		List<Integer> others = new ArrayList<>();
		for (int page = 2; page <= pages; page++) {
			others.add(page);
		}
		Collections.shuffle(others);
		for (int page : others.subList(0, Math.min(POOL_PAGES - 1, others.size()))) {
			scryfall.searchPage(ALL, "released", "desc", page).data().stream().map(ArtSeries::toBackdrop).flatMap(Optional::stream).forEach(found::add);
		}
		pool = new Kept(List.copyOf(found), Instant.now().plus(found.isEmpty() ? Duration.ofMinutes(5) : POOL_KEEP));
		return pool.found();
	}

	/** count different cards from the pool, or all of them when it holds fewer. */
	static List<Backdrop> pick(List<Backdrop> from, int count, RandomGenerator random) {
		List<Backdrop> copy = new ArrayList<>(from);
		int take = Math.min(Math.max(count, 0), copy.size());
		for (int i = 0; i < take; i++) {
			Collections.swap(copy, i, i + random.nextInt(copy.size() - i));
		}
		return List.copyOf(copy.subList(0, take));
	}

	/** Looks one card up again by its id, so a chosen backdrop is always a real Art Series card's art, never an address sent by a browser. */
	public Optional<Backdrop> byId(UUID scryfallId) {
		return scryfall.collectionByIds(List.of(scryfallId)).data().stream().findFirst().flatMap(ArtSeries::toBackdrop);
	}

	static Optional<Backdrop> toBackdrop(ScryfallCard card) {
		if (card == null || card.id() == null || card.set_name() == null || !card.set_name().endsWith("Art Series")) {
			return Optional.empty();
		}
		ScryfallCard.Face face = card.card_faces() == null || card.card_faces().isEmpty() ? null : card.card_faces().get(0);
		ScryfallCard.ImageUris images = face != null && face.image_uris() != null ? face.image_uris() : card.image_uris();
		if (images == null || images.art_crop() == null || !images.art_crop().startsWith("https://cards.scryfall.io/")) {
			return Optional.empty();
		}
		String name = face != null && face.name() != null ? face.name() : card.name();
		String artist = face != null && face.artist() != null ? face.artist() : card.artist();
		return Optional.of(new Backdrop(UUID.fromString(card.id()), name, artist, card.set_name(), images.art_crop()));
	}

	/** Scryfall's query for a name, with quotes removed and spaces tidied; null when the text is under two letters. */
	static String query(String text) {
		String clean = text == null ? "" : text.replace("\"", "").replaceAll("\\s+", " ").trim();
		if (clean.length() < 2) {
			return null;
		}
		if (clean.length() > 60) {
			clean = clean.substring(0, 60).trim();
		}
		return "layout:art-series name:\"" + clean + "\"";
	}
}
