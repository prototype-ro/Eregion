package io.eregion.analysis;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import io.eregion.card.NameNormalizer;
import io.eregion.card.ScryfallClient;
import io.eregion.common.AdvisoryLock;

/**
 * Keeps the Game Changers and extra turn cards current from Scryfall ({@code is:gamechanger}, {@code otag:extra-turn}), once a day.
 * Wizards updates the Game Changers list a few times a year, so this is how a new list reaches the app without a release.
 */
@Service
public class BracketFlagSyncService {

	public static final String SOURCE = "scryfall";
	private static final long LOCK_KEY = 0x45726567_02L;
	private static final Logger log = LoggerFactory.getLogger(BracketFlagSyncService.class);
	private static final int MAX_PAGES = 10;

	/** Flag to Scryfall search and the fewest cards the search must return to be believed. A near-empty answer means the read failed. */
	private record Source(String query, int minPlausible) {
	}

	private static final Map<String, Source> SOURCES = new LinkedHashMap<>();

	static {
		SOURCES.put(BracketFlags.GAME_CHANGER, new Source("is:gamechanger", 20));
		SOURCES.put(BracketFlags.EXTRA_TURN, new Source("otag:extra-turn f:commander", 20));
	}

	private final ScryfallClient scryfall;
	private final BracketFlagRepository flags;
	private final TransactionTemplate tx;
	private final AdvisoryLock lock;
	private final boolean enabled;
	private final int minAgeHours;

	public BracketFlagSyncService(ScryfallClient scryfall, BracketFlagRepository flags, PlatformTransactionManager transactions, AdvisoryLock lock,
			@Value("${eregion.bracket-flags.enabled:true}") boolean enabled,
			@Value("${eregion.bracket-flags.min-age-hours:20}") int minAgeHours) {
		this.scryfall = scryfall;
		this.flags = flags;
		this.tx = new TransactionTemplate(transactions);
		this.lock = lock;
		this.enabled = enabled;
		this.minAgeHours = minAgeHours;
	}

	@Scheduled(initialDelayString = "${eregion.bracket-flags.initial-delay-ms:120000}", fixedDelayString = "${eregion.bracket-flags.every-ms:86400000}")
	public void scheduled() {
		if (!enabled) {
			return;
		}
		try {
			boolean ran = lock.runIfFree(LOCK_KEY, () -> {
				boolean fresh = flags.lastSynced(SOURCE).map(at -> Duration.between(at, Instant.now()).toHours() < minAgeHours).orElse(false);
				if (!fresh) {
					sync();
				}
			});
			if (!ran) {
				log.info("Bracket flag job skipped: another server is running it");
			}
		}
		catch (RuntimeException ex) {
			// A failed run keeps the flags from the last good one and tries again at the next interval.
			log.warn("Bracket flag sync failed", ex);
		}
	}

	/** Reads every flag's cards, then replaces the stored ones. A flag whose read looks wrong is left as it was. */
	public void sync() {
		Instant start = Instant.now();
		Map<String, List<String>> read = new LinkedHashMap<>();
		SOURCES.forEach((flag, source) -> {
			List<String> names = scryfall.searchNames(source.query(), MAX_PAGES);
			if (names.size() < source.minPlausible()) {
				throw new IllegalStateException("Only " + names.size() + " cards came back for " + flag + ", not replacing it");
			}
			read.put(flag, names);
		});
		tx.executeWithoutResult(status -> read.forEach((flag, names) -> {
			// Scryfall names double-faced cards "Front // Back": both the full name and the front face are stored, so either spelling matches.
			List<String> normalized = names.stream()
					.flatMap(name -> java.util.stream.Stream.of(name, BracketLists.frontFace(name)))
					.map(NameNormalizer::normalize)
					.distinct()
					.toList();
			flags.replace(flag, SOURCE, normalized, start);
		}));
		log.info("Bracket flag sync: {} flags, {} s", read.size(), Duration.between(start, Instant.now()).toSeconds());
	}
}
