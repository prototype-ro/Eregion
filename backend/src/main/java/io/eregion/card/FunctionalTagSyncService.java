package io.eregion.card;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import io.eregion.card.FunctionalTagRepository.Candidate;
import io.eregion.common.AdvisoryLock;
import io.eregion.card.FunctionalTagRepository.Tag;

/**
 * Keeps each card's functional roles current, from two sources.
 *
 * <p>Scryfall's Tagger project tags cards by what they do, and the tags can be searched ({@code otag:ramp}). For every tag in
 * {@code functional-tags.json} the sync reads the commander-legal cards that carry it and stores every category a card belongs to,
 * at full confidence, for the cards Eregion knows.
 *
 * <p>{@link FunctionalRules}, a handful of patterns over the rules text, adds guesses stored as source "regex" at a lower confidence.
 * A card Tagger has not tagged can get its main role from them. A tagged card keeps its community roles and may gain extra ones,
 * which are only ever secondary. Cards no rule matches stay uncategorized.
 *
 * <p>Then each card's main role is chosen: the most confident row, then the category higher in the mapping file. The rest are
 * secondary. Only the main role is counted anywhere, so a card is never counted twice.
 */
@Service
public class FunctionalTagSyncService {

	public static final String SOURCE = "scryfall";
	/** The one lock the job takes, so that only one server at a time reads Scryfall or rewrites the roles. */
	private static final long LOCK_KEY = 0x45726567_01L;
	private static final String HASH_KEY = "rule-files-hash";
	private static final Logger log = LoggerFactory.getLogger(FunctionalTagSyncService.class);
	/** Scryfall pages hold 175 cards, so this is far more than any one tag has. */
	private static final int MAX_PAGES = 60;
	/** Far fewer tagged cards than this means the reads failed, not that the tags are empty. */
	private static final int MIN_PLAUSIBLE = 100;
	/** Tags read at once. Every request still goes through the client's spacing. */
	private static final int READ_THREADS = 4;
	/** Everything Tagger says is community-verified, so it is trusted fully. */
	private static final double COMMUNITY_CONFIDENCE = 1.0;

	private final ScryfallClient scryfall;
	private final FunctionalTagRepository tags;
	private final FunctionalTagMapping mapping;
	private final FunctionalRules rules;
	private final TransactionTemplate tx;
	private final AdvisoryLock lock;
	private final boolean enabled;
	private final int minAgeHours;

	public FunctionalTagSyncService(ScryfallClient scryfall, FunctionalTagRepository tags, PlatformTransactionManager transactions, AdvisoryLock lock,
			@Value("${eregion.functional-tags.enabled:true}") boolean enabled,
			@Value("${eregion.functional-tags.min-age-hours:20}") int minAgeHours) {
		this.scryfall = scryfall;
		this.tags = tags;
		this.mapping = FunctionalTagMapping.load();
		this.rules = FunctionalRules.load();
		this.tx = new TransactionTemplate(transactions);
		this.lock = lock;
		this.enabled = enabled;
		this.minAgeHours = minAgeHours;
	}

	@Scheduled(initialDelayString = "${eregion.functional-tags.initial-delay-ms:60000}", fixedDelayString = "${eregion.functional-tags.every-ms:86400000}")
	public void scheduled() {
		if (!enabled) {
			return;
		}
		try {
			boolean ran = lock.runIfFree(LOCK_KEY, () -> {
				boolean fresh = tags.lastSynced(SOURCE).map(at -> Duration.between(at, Instant.now()).toHours() < minAgeHours).orElse(false);
				if (!fresh) {
					sync();
				}
				else if (rulesChanged()) {
					// Scryfall was read recently, but the rule files changed since the roles were worked out. That needs no Scryfall call.
					categorizeNew(true);
					remember();
				}
			});
			if (!ran) {
				log.info("Functional tag job skipped: another server is running it");
			}
		}
		catch (RuntimeException ex) {
			// A failed run keeps the roles from the last good one and tries again at the next interval.
			log.warn("Functional tag sync failed", ex);
		}
	}

	/** Cards imported since the last run get a guess within minutes, without waiting for the daily read of Scryfall. */
	@Scheduled(initialDelayString = "${eregion.functional-tags.guess-initial-delay-ms:90000}", fixedDelayString = "${eregion.functional-tags.guess-every-ms:600000}")
	public void guessNewCards() {
		if (!enabled) {
			return;
		}
		try {
			lock.runIfFree(LOCK_KEY, () -> categorizeNew(false));
		}
		catch (RuntimeException ex) {
			log.warn("Functional tag guessing failed", ex);
		}
	}

	private String currentHash() {
		return ConfigHash.of(FunctionalTagMapping.RESOURCE, FunctionalRules.RESOURCE);
	}

	/** Whether the files that decide the roles are not the ones the stored roles were worked out with. */
	private boolean rulesChanged() {
		return !currentHash().equals(tags.state(HASH_KEY).orElse(null));
	}

	private void remember() {
		tags.setState(HASH_KEY, currentHash());
	}

	/**
	 * Reads each tag's cards from Scryfall, a few tags at a time. One search page takes about a second and a tag can have dozens of pages,
	 * so reading them one after another takes minutes. The client still spaces every request, so more tags in flight does not mean more
	 * requests per second.
	 */
	private Map<String, List<String>> readTags(Set<String> wanted) {
		java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(READ_THREADS);
		try {
			Map<String, java.util.concurrent.Future<List<String>>> pending = new LinkedHashMap<>();
			for (String tag : wanted) {
				pending.put(tag, pool.submit(() -> scryfall.searchNames("otag:" + tag + " f:commander", MAX_PAGES)));
			}
			Map<String, List<String>> namesByTag = new LinkedHashMap<>();
			for (Map.Entry<String, java.util.concurrent.Future<List<String>>> entry : pending.entrySet()) {
				try {
					namesByTag.put(entry.getKey(), entry.getValue().get());
				}
				catch (InterruptedException ex) {
					Thread.currentThread().interrupt();
					throw new IllegalStateException("Interrupted while reading tags", ex);
				}
				catch (java.util.concurrent.ExecutionException ex) {
					throw new IllegalStateException("Could not read the tag " + entry.getKey(), ex.getCause());
				}
			}
			return namesByTag;
		}
		finally {
			pool.shutdownNow();
		}
	}

	/** Reads every tag from Scryfall, replaces that source's roles, then guesses for the rest and picks each card's main role. */
	public int sync() {
		Instant start = Instant.now();
		Set<String> wanted = mapping.allTags();
		Map<String, List<String>> namesByTag = readTags(wanted);
		Map<String, List<String>> categoriesByName = mapping.assignAll(namesByTag);
		if (categoriesByName.size() < MIN_PLAUSIBLE) {
			// Scryfall answered, but with almost nothing. Replacing now would wipe every role, so keep the old ones.
			throw new IllegalStateException("Only " + categoriesByName.size() + " tagged cards came back, not replacing the stored roles");
		}
		// Cards none of the main categories claimed may still have a long tail role, named after the community's tag.
		categoriesByName.putAll(mapping.assignLongTail(namesByTag, new LinkedHashSet<>(categoriesByName.keySet())));
		int count = tx.execute(status -> {
			Map<String, UUID> ids = tags.idsByName(categoriesByName.keySet());
			List<Tag> rows = new ArrayList<>();
			categoriesByName.forEach((name, categories) -> {
				UUID id = ids.get(name);
				if (id != null) {
					categories.forEach(category -> rows.add(new Tag(id, category, SOURCE, COMMUNITY_CONFIDENCE)));
				}
			});
			tags.replaceSource(SOURCE, rows, start);
			guess(false, start);
			choosePrimaries();
			return (int) rows.stream().map(Tag::cardId).distinct().count();
		});
		remember();
		log.info("Functional tag sync: {} tags read, {} cards categorized from Scryfall, in {} s", wanted.size(), count,
				Duration.between(start, Instant.now()).toSeconds());
		return count;
	}

	/**
	 * Runs the text rules. New cards (no tag at all) are the quick case. With {@code everyCard} the rules look at every non-land card,
	 * which is how a tagged card gets extra roles and how a changed rule reaches the old guesses.
	 */
	public void categorizeNew(boolean everyCard) {
		tx.executeWithoutResult(status -> {
			int guessed = guess(!everyCard, Instant.now());
			// A full run also re-picks the main roles, so a change to the priority order in the mapping file takes effect at the next start.
			if (guessed > 0 || everyCard) {
				choosePrimaries();
			}
			if (guessed > 0) {
				log.info("Functional tag guesses: {} cards", guessed);
			}
		});
	}

	/**
	 * Guesses from the rules text. A guess only adds: it skips any category the card already has from a community tag, and since a
	 * community tag is always more confident, a guess is never a card's main role when one exists. Returns how many cards got a guess.
	 */
	int guess(boolean onlyUntagged, Instant at) {
		List<Candidate> candidates = tags.candidates(onlyUntagged);
		Map<UUID, Set<String>> known = new HashMap<>();
		tags.allTags().stream().filter(tag -> !FunctionalRules.SOURCE.equals(tag.source()))
				.forEach(tag -> known.computeIfAbsent(tag.cardId(), key -> new LinkedHashSet<>()).add(tag.category()));
		List<Tag> rows = new ArrayList<>();
		Set<UUID> matched = new LinkedHashSet<>();
		for (Candidate card : candidates) {
			Set<String> already = known.getOrDefault(card.id(), Set.of());
			rules.match(card.oracleText()).forEach((category, confidence) -> {
				if (!already.contains(category)) {
					rows.add(new Tag(card.id(), category, FunctionalRules.SOURCE, confidence));
					matched.add(card.id());
				}
			});
		}
		// Every candidate is cleared first, so a card whose rules no longer match loses its old guess.
		tags.replaceGuesses(candidates.stream().map(Candidate::id).toList(), rows, at);
		return matched.size();
	}

	/** Picks each card's main role: the most confident row, then the category higher in the mapping file. */
	void choosePrimaries() {
		Map<UUID, List<Tag>> byCard = new HashMap<>();
		tags.allTags().forEach(tag -> byCard.computeIfAbsent(tag.cardId(), key -> new ArrayList<>()).add(tag));
		Comparator<Tag> best = Comparator.comparingDouble((Tag tag) -> -tag.confidence())
				.thenComparingInt(tag -> mapping.priority(tag.category()))
				.thenComparing(Tag::category);
		List<Tag> primaries = byCard.values().stream().map(rows -> rows.stream().min(best).orElseThrow()).toList();
		tags.setPrimaries(primaries);
	}
}
